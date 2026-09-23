# ⛽ PrecioGas MX

Encuentra la gasolina más barata cerca de ti. Usa los **precios oficiales** que publica la
Comisión Reguladora de Energía (CRE) de las **13,850 estaciones de servicio de México**.

No es un catálogo con datos inventados: cada precio viene del feed público de la CRE y se
actualiza todos los días.

## Qué hace

- **Ubicación o búsqueda.** Usa tu GPS o busca cualquier ciudad o colonia del país.
- **Lista ordenada por precio o distancia**, con el radio que elijas (de 3 a 50 km).
- **Mapa** con las estaciones pintadas según su precio: verde debajo del promedio, ámbar en
  el promedio y rojo arriba.
- **Cuánto ahorras.** Calcula la diferencia por tanque de 50 L entre la estación más barata
  y la más cara de tu zona.
- **Compara con el promedio** de tu zona y con el nacional.
- **Cómo llegar**, con un link directo a Google Maps.
- Regular, Premium y Diésel · tema claro y oscuro · pensado para celular.

## Cómo funciona

La CRE publica dos archivos XML: uno con las estaciones y otro con sus precios.

```
places.xml     ─┐
prices.xml     ─┼─> scripts/build-data.mjs ─> public/data/stations.json ─> la app
states.geojson ─┘
```

`scripts/build-data.mjs` los descarga, los cruza, descarta precios imposibles y coordenadas
fuera de México, le asigna su estado a cada gasolinera (con un cálculo de punto dentro de
polígono) y saca los promedios nacionales y por estado.

El resultado es **un solo JSON de 0.9 MB** (310 KB comprimido) que la app carga una vez. Así
no hace falta backend: el filtrado, las distancias (fórmula de haversine) y el orden se
calculan en el navegador.

## Correrlo en local

```bash
npm install
npm run data    # descarga los datos oficiales y genera public/data/stations.json
npm run dev
```

`npm run data -- --cache` reutiliza los XML ya descargados, útil mientras desarrollas.

## Stack

React · Vite · Leaflet · OpenStreetMap · Nominatim (búsqueda de lugares) · sin backend

## Datos y créditos

- Precios: [Comisión Reguladora de Energía](https://publicacionexterna.azurewebsites.net/publicaciones/prices) (datos abiertos)
- Mapa: [OpenStreetMap](https://www.openstreetmap.org/copyright)
- Búsqueda de lugares: [Nominatim](https://nominatim.org/)

Los precios son los que cada estación le reporta a la CRE, así que puede haber diferencias
con lo que ves en la bomba.
