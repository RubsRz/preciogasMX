import { maneuverIcon } from "../lib/route";
import { distancePhrase } from "../lib/nav";

/** Tarjeta de la maniobra actual, como la barra de arriba en Maps. */
export default function NavBanner({ nav, arrived, muted, onMute, onStop }) {
    if (arrived) {
        return (
            <div className="nav-banner is-arrived">
                <span className="nav-icon" aria-hidden="true">⚑</span>
                <div className="nav-text">
                    <p className="nav-distance">Llegaste</p>
                    <p className="nav-instruction">Ya estás en la gasolinera</p>
                </div>
                <button type="button" className="nav-stop" onClick={onStop}>Terminar</button>
            </div>
        );
    }

    if (!nav?.step) {
        return (
            <div className="nav-banner">
                <span className="nav-icon" aria-hidden="true">◎</span>
                <div className="nav-text">
                    <p className="nav-distance">Buscando señal…</p>
                    <p className="nav-instruction">Esperando tu ubicación</p>
                </div>
                <button type="button" className="nav-stop" onClick={onStop}>Salir</button>
            </div>
        );
    }

    const shown = nav.next ?? nav.step;

    return (
        <div className="nav-banner">
            <span className="nav-icon" aria-hidden="true">{maneuverIcon(shown.type)}</span>
            <div className="nav-text">
                <p className="nav-distance">{nav.next ? distancePhrase(nav.metersToNext) : "Continúa"}</p>
                <p className="nav-instruction">{shown.instruction}</p>
            </div>
            <div className="nav-actions">
                <button
                    type="button"
                    className="nav-mute"
                    onClick={onMute}
                    aria-label={muted ? "Activar voz" : "Silenciar voz"}
                >
                    {muted ? "🔇" : "🔊"}
                </button>
                <button type="button" className="nav-stop" onClick={onStop}>Terminar</button>
            </div>
        </div>
    );
}
