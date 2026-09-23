import { useCallback, useEffect, useRef, useState } from "react";

const SNAPS = { peek: 0.16, half: 0.42, tall: 0.64, full: 0.88 }; // fracción de la altura de pantalla

/**
 * Hoja deslizable de celular: se puede arrastrar con el dedo y se queda en la
 * posición más cercana (abajo, a la mitad o arriba).
 */
export function useSheet(initial = "peek") {
    const [snap, setSnap] = useState(initial);
    const [dragHeight, setDragHeight] = useState(null); // altura mientras se arrastra
    const drag = useRef(null);

    const heightFor = useCallback((name) => Math.round(window.innerHeight * SNAPS[name]), []);

    const onPointerDown = useCallback(
        (event) => {
            if (!window.matchMedia("(max-width: 900px)").matches) return;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            drag.current = { startY: event.clientY, startHeight: heightFor(snap), moved: false };
            setDragHeight(drag.current.startHeight);
        },
        [snap, heightFor],
    );

    const onPointerMove = useCallback((event) => {
        if (!drag.current) return;
        const delta = drag.current.startY - event.clientY;
        if (Math.abs(delta) > 4) drag.current.moved = true;
        const min = window.innerHeight * SNAPS.peek * 0.7;
        const max = window.innerHeight * SNAPS.full;
        setDragHeight(Math.min(max, Math.max(min, drag.current.startHeight + delta)));
    }, []);

    const onPointerUp = useCallback(() => {
        if (!drag.current) return;
        const moved = drag.current.moved;
        const height = dragHeight ?? drag.current.startHeight;
        drag.current = null;
        setDragHeight(null);

        if (!moved) {
            // Un toque simple va subiendo de altura y, desde arriba, cierra
            const order = Object.keys(SNAPS);
            setSnap((current) => order[(order.indexOf(current) + 1) % order.length]);
            return;
        }
        // Se queda en el punto más cercano a donde se soltó
        const closest = Object.entries(SNAPS).reduce((best, [name, fraction]) =>
            Math.abs(window.innerHeight * fraction - height) < Math.abs(window.innerHeight * SNAPS[best] - height)
                ? name
                : best,
        "peek");
        setSnap(closest);
    }, [dragHeight]);

    useEffect(() => {
        const cancel = () => {
            drag.current = null;
            setDragHeight(null);
        };
        window.addEventListener("pointercancel", cancel);
        return () => window.removeEventListener("pointercancel", cancel);
    }, []);

    return {
        snap,
        setSnap,
        dragging: dragHeight != null,
        style: dragHeight != null ? { height: `${dragHeight}px`, transition: "none" } : undefined,
        handlers: { onPointerDown, onPointerMove, onPointerUp },
    };
}
