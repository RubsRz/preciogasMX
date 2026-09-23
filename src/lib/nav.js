import { distanceKm } from "./stations";

/** Metros entre dos puntos [lat, lon]. */
export const metersBetween = (a, b) => distanceKm({ lat: a[0], lon: a[1] }, { lat: b[0], lon: b[1] }) * 1000;

/**
 * Punto del trazo más cercano a la posición actual.
 * Regresa el índice, qué tan lejos está de la ruta y cuántos metros faltan para el final.
 */
export function locateOnRoute(path, position) {
    const point = [position.lat, position.lon];
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    for (let i = 0; i < path.length; i++) {
        const distance = metersBetween(path[i], point);
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestIndex = i;
        }
    }

    let remaining = 0;
    for (let i = nearestIndex; i < path.length - 1; i++) remaining += metersBetween(path[i], path[i + 1]);

    return { index: nearestIndex, offRoute: nearestDistance, remainingMeters: remaining };
}

/**
 * Paso actual y distancia hasta la siguiente maniobra.
 * Los pasos de Valhalla traen el índice del trazo donde empiezan.
 */
export function currentStep(steps, path, index) {
    if (!steps.length) return null;

    let current = 0;
    for (let i = 0; i < steps.length; i++) if (index >= steps[i].index) current = i;

    const next = steps[current + 1];
    let metersToNext = 0;
    if (next) {
        for (let i = index; i < Math.min(next.index, path.length - 1); i++) {
            metersToNext += metersBetween(path[i], path[i + 1]);
        }
    }

    return { step: steps[current], next, metersToNext: next ? metersToNext : 0, isLast: !next };
}

/** "En 120 m" / "En 1.2 km" / "Ahora" */
export function distancePhrase(meters) {
    if (meters < 30) return "Ahora";
    if (meters < 1000) return `En ${Math.round(meters / 10) * 10} m`;
    return `En ${(meters / 1000).toFixed(1)} km`;
}

/** Lee la instrucción en voz alta (si el navegador puede). */
export function speak(text) {
    if (!("speechSynthesis" in window) || !text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-MX";
    utterance.rate = 1.05;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
}
