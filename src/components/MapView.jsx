import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
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

/** En celular el mapa vive escondido detrás del panel: al mostrarlo hay que remedirlo. */
function ResizeOnShow({ active }) {
    const map = useMap();
    useEffect(() => {
        if (active) map.invalidateSize();
    }, [active, map]);
    return null;
}

const youAreHere = L.divIcon({
    className: "",
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,.3)"></div>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
});

export default function MapView({ center, stations, fuel, average, selectedId, onSelect, showMarker, active }) {
    return (
        <MapContainer center={[center.lat, center.lon]} zoom={12} scrollWheelZoom zoomControl={false} preferCanvas>
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                maxZoom={19}
            />
            <Recenter center={center} zoom={12} />
            <ResizeOnShow active={active} />

            {showMarker && <Marker position={[center.lat, center.lon]} icon={youAreHere} />}

            {stations.map((station) => {
                const price = station.prices[fuel];
                const tier = priceTier(price, average);
                const isSelected = station.id === selectedId;
                return (
                    <CircleMarker
                        key={station.id}
                        center={[station.lat, station.lon]}
                        radius={isSelected ? 11 : 7}
                        pathOptions={{
                            color: isSelected ? "#fff" : TIER_COLORS[tier],
                            weight: isSelected ? 3 : 1.5,
                            fillColor: TIER_COLORS[tier],
                            fillOpacity: 0.85,
                        }}
                        eventHandlers={{ click: () => onSelect(station.id) }}
                    >
                        <Popup>
                            <p className="popup-name">{station.name}</p>
                            <div className="popup-prices">
                                {station.prices.regular && <span>Regular <b>{money(station.prices.regular)}</b></span>}
                                {station.prices.premium && <span>Premium <b>{money(station.prices.premium)}</b></span>}
                                {station.prices.diesel && <span>Diésel <b>{money(station.prices.diesel)}</b></span>}
                            </div>
                            {station.distance != null && <div>A {km(station.distance)} de ti</div>}
                            <a
                                className="popup-link"
                                href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lon}`}
                                target="_blank"
                                rel="noopener"
                            >
                                Cómo llegar →
                            </a>
                        </Popup>
                    </CircleMarker>
                );
            })}
        </MapContainer>
    );
}
