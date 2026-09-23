import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { TIER_COLORS, km, money, priceTier } from "../lib/stations";

/** Mueve el mapa cuando cambia el centro (ubicación o búsqueda). */
function Recenter({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo([center.lat, center.lon], zoom, { duration: 0.8 });
    }, [center.lat, center.lon, zoom, map]);
    return null;
}

/** En celular el panel tapa parte del mapa: al cambiar de tamaño hay que remedirlo. */
function ResizeOnShow({ active }) {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
    }, [active, map]);
    return null;
}

/** Mientras navegas, el mapa sigue tu posición. */
function FollowUser({ position, navigating }) {
    const map = useMap();
    useEffect(() => {
        if (!navigating || !position) return;
        map.setView([position.lat, position.lon], Math.max(map.getZoom(), 16), { animate: true, duration: 0.5 });
    }, [position, navigating, map]);
    return null;
}

/** Al trazar una ruta, encuadra el mapa para que se vea completa. */
function FitRoute({ path, navigating }) {
    const map = useMap();
    useEffect(() => {
        if (!path?.length || navigating) return;
        // En celular el panel tapa la parte de abajo del mapa, así que se deja más margen
        const isPhone = window.matchMedia("(max-width: 900px)").matches;
        map.fitBounds(path, {
            paddingTopLeft: [40, 60],
            paddingBottomRight: [40, isPhone ? 220 : 60],
            maxZoom: 15,
        });
    }, [path, navigating, map]);
    return null;
}

const youAreHere = L.divIcon({
    className: "",
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,.3)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

/** Durante la navegación: flecha que apunta hacia donde avanzas, con su cono de visión. */
const headingIcon = (heading) =>
    L.divIcon({
        className: "",
        html: `<div class="nav-arrow" style="transform: rotate(${heading ?? 0}deg)">
                 <span class="nav-arrow-cone"></span>
                 <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                   <circle cx="12" cy="12" r="11" fill="#fff"/>
                   <path d="M12 3.5 19 20 12 16 5 20z" fill="#3b82f6"/>
                 </svg>
               </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
    });

export default function MapView({ center, stations, fuel, average, selectedId, onSelect, onRoute, showMarker, active, route, routeStation, livePosition, navigating, heading }) {
    return (
        <MapContainer center={[center.lat, center.lon]} zoom={12} scrollWheelZoom zoomControl={false} preferCanvas>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                maxZoom={19}
            />
            {!routeStation && <Recenter center={center} zoom={12} />}
            <FitRoute path={route?.path} navigating={navigating} />
            <FollowUser position={livePosition} navigating={navigating} />
            <ResizeOnShow active={active} />

            {(livePosition || showMarker) && (
                <Marker
                    position={livePosition ? [livePosition.lat, livePosition.lon] : [center.lat, center.lon]}
                    icon={navigating && livePosition ? headingIcon(heading) : youAreHere}
                />
            )}

            {route?.path && (
                <Polyline
                    positions={route.path}
                    pathOptions={{ color: "#3b82f6", weight: 6, opacity: 0.85, dashArray: route.approx ? "10 8" : null }}
                />
            )}

            {(routeStation ? [routeStation] : stations).map((station) => {
                const price = station.prices[fuel];
                const tier = priceTier(price, average);
                const isSelected = station.id === selectedId;
                return (
                    <CircleMarker
                        key={station.id}
                        center={[station.lat, station.lon]}
                        radius={routeStation ? 12 : isSelected ? 11 : 7}
                        pathOptions={{
                            color: isSelected ? "#fff" : TIER_COLORS[tier],
                            weight: isSelected ? 3 : 1.5,
                            fillColor: TIER_COLORS[tier],
                            fillOpacity: 0.85,
                        }}
                        eventHandlers={{ click: () => onSelect(station.id) }}
                    >
                        <Popup>
                            <p className="popup-name">{station.brand ?? station.name}</p>
                            {station.brand && <p className="popup-legal">{station.name}</p>}
                            <div className="popup-prices">
                                {station.prices.regular && <span>Regular <b>{money(station.prices.regular)}</b></span>}
                                {station.prices.premium && <span>Premium <b>{money(station.prices.premium)}</b></span>}
                                {station.prices.diesel && <span>Diésel <b>{money(station.prices.diesel)}</b></span>}
                            </div>
                            {station.distance != null && <div>A {km(station.distance)} en línea recta</div>}
                            {!routeStation && (
                                <button type="button" className="popup-link" onClick={() => onRoute(station)}>
                                    Trazar ruta →
                                </button>
                            )}
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
