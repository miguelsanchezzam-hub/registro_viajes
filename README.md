# Registro de viajes empresariales

App móvil para registrar los viajes que haces llevando personas a empresas y saber cuánto vas a recibir cada semana.

## Cómo funciona

- **Tipos de viaje y tarifa:** Redondo, Simple, Doble, Triple, Aeropuerto, Sucursal y Especial (monto libre). Las tarifas se editan en la app.
- **Registro rápido:** botón flotante «+» abajo a la derecha; las opciones salen hacia arriba ordenadas por precio (la más barata junto al pulgar, «Especial» al final).
- **Sin escribir nombres:** las personas se guardan una sola vez y después se eligen con un toque.
- **Hora automática:** solo cuentan la llegada a planta (quién entra) y la salida de planta (quién sale). Un redondo tiene las dos. La app marca la hora del teléfono al guardar.
- **Lista por días:** del más reciente al más antiguo y, dentro del día, por hora. Cada día arranca cerrado mostrando solo su resumen; al tocarlo se abre el detalle.
- **Editar / eliminar:** aparecen al tocar un viaje.
- **Tema:** sigue el del dispositivo. Día: azul rey y blanco. Noche: azul marino y negro.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `client/` | Interfaz React + Tailwind (`src/App.tsx`, `theme.css`) |
| `server/src/` | Acciones del servidor y esquema (`actions.ts`, `schema.ts`) |
| `drizzle/` | Migraciones SQL. La `0003` agrega el catálogo de personas y la dirección entrada/salida |

Los viajes registrados antes de la migración `0003` quedan como «Entra» porque antes no se guardaba esa dirección.

Pensada para ejecutarse en la plataforma de *spaces* de Hatch (ver `AGENTS.md` y `space.json`).
