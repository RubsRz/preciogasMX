import { useEffect, useRef, useState } from "react";
import { searchPlaces } from "../lib/geocode";

const RADII = [3, 5, 10, 25, 50];

export default function Controls({ radius, onRadius, sort, onSort, onPlace, onLocate, locating }) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const box = useRef(null);

    // Busca 400 ms después de dejar de escribir, para no saturar Nominatim
    useEffect(() => {
        if (query.trim().length < 3) return setResults([]);
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            try {
                setResults(await searchPlaces(query, controller.signal));
            } catch {
                setResults([]);
            }
        }, 400);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    // Cierra las sugerencias al hacer clic fuera
    useEffect(() => {
        const onClick = (e) => !box.current?.contains(e.target) && setResults([]);
        document.addEventListener("click", onClick);
        return () => document.removeEventListener("click", onClick);
    }, []);

    const choose = (place) => {
        setResults([]);
        setQuery(place.name.split(",")[0]);
        onPlace(place);
    };

    return (
        <div className="controls">
            <div className="search" ref={box}>
                <span className="search-icon" aria-hidden="true">⌕</span>
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Busca tu ciudad o colonia…"
                    aria-label="Buscar ubicación"
                />
                <button
                    type="button"
                    className="locate-btn"
                    onClick={onLocate}
                    title="Usar mi ubicación"
                    aria-label="Usar mi ubicación"
                >
                    {locating ? "…" : "◎"}
                </button>
                {results.length > 0 && (
                    <ul className="suggestions">
                        {results.map((place) => (
                            <li key={place.id}>
                                <button type="button" onClick={() => choose(place)}>{place.name}</button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="filters">
                <select value={radius} onChange={(e) => onRadius(Number(e.target.value))} aria-label="Radio de búsqueda">
                    {RADII.map((value) => (
                        <option key={value} value={value}>A {value} km a la redonda</option>
                    ))}
                </select>
                <select value={sort} onChange={(e) => onSort(e.target.value)} aria-label="Ordenar por">
                    <option value="price">Más baratas primero</option>
                    <option value="distance">Más cercanas primero</option>
                </select>
            </div>
        </div>
    );
}
