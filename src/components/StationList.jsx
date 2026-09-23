import { useEffect, useRef } from "react";
import { BRAND_COLORS, km, money, priceTier } from "../lib/stations";

export default function StationList({ stations, fuel, average, selectedId, onSelect, onRoute }) {
    const listRef = useRef(null);

    // Si la selección viene del mapa, se hace scroll a esa tarjeta
    useEffect(() => {
        if (!selectedId) return;
        listRef.current?.querySelector(`[data-id="${selectedId}"]`)?.scrollIntoView({ block: "nearest" });
    }, [selectedId]);

    if (!stations.length) {
        return (
            <div className="empty">
                <span aria-hidden="true">🗺️</span>
                <p>No hay estaciones con precio de este combustible en el radio elegido.</p>
                <p>Prueba con un radio mayor u otra ubicación.</p>
            </div>
        );
    }

    return (
        <ul className="list" ref={listRef}>
            {stations.map((station, index) => {
                const price = station.prices[fuel];
                const tier = priceTier(price, average);
                return (
                    <li key={station.id}>
                        <button
                            type="button"
                            data-id={station.id}
                            className={`station ${station.id === selectedId ? "is-active" : ""} ${station.recommended ? "is-best" : ""}`}
                            onClick={() => onSelect(station.id)}
                        >
                            <span className={`station-rank ${station.recommended ? "is-star" : ""}`}>
                                {station.recommended ? "★" : index + 1}
                            </span>
                            <span className="station-body">
                                <span className="station-name">
                                    {station.brand && (
                                        <span
                                            className="brand-dot"
                                            style={{ background: BRAND_COLORS[station.brand] ?? "var(--muted)" }}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {station.brand ?? station.name}
                                </span>
                                {station.brand && <span className="station-legal">{station.name}</span>}
                                {station.recommended && <span className="station-badge">Recomendada</span>}
                                <span className="station-meta">
                                    <span>{km(station.distance)}</span>
                                    {station.state && <span>· {station.state}</span>}
                                </span>
                                <span className="station-prices">
                                    {station.prices.regular && <span>Reg <b>{money(station.prices.regular)}</b></span>}
                                    {station.prices.premium && <span>Prem <b>{money(station.prices.premium)}</b></span>}
                                    {station.prices.diesel && <span>Dsl <b>{money(station.prices.diesel)}</b></span>}
                                </span>
                            </span>
                            <span className="station-price">
                                <strong className={`price-${tier}`}>{money(price)}</strong>
                                <small>por litro</small>
                                <span
                                    role="button"
                                    tabIndex={0}
                                    className="station-route"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRoute(station);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onRoute(station);
                                        }
                                    }}
                                >
                                    Ruta →
                                </span>
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
