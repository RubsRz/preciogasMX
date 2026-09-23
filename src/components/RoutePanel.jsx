import { km, money } from "../lib/stations";
import { minutes } from "../lib/route";

const TANK_LITERS = 50;

/** Tarjeta que reemplaza a la lista mientras se ve una ruta. */
export default function RoutePanel({ station, route, fuel, loading, onExit }) {
    const price = station.prices[fuel];

    return (
        <div className="route-panel">
            <div className="route-head">
                <div>
                    <p className="route-label">Ruta hacia</p>
                    <h2 className="route-name">{station.name}</h2>
                </div>
                <button type="button" className="icon-btn" onClick={onExit} aria-label="Salir de la ruta">✕</button>
            </div>

            <dl className="route-stats">
                <div>
                    <dt>Distancia</dt>
                    <dd>{loading || !route ? "…" : km(route.km)}</dd>
                </div>
                <div>
                    <dt>Tiempo</dt>
                    <dd>{loading || !route ? "…" : (minutes(route.minutes) ?? "—")}</dd>
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
                <button type="button" className="btn-ghost" onClick={onExit}>← Salir de la ruta</button>
                <a
                    className="btn-primary"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}&travelmode=driving`}
                    target="_blank"
                    rel="noopener"
                >
                    Navegar en Google Maps
                </a>
            </div>
        </div>
    );
}
