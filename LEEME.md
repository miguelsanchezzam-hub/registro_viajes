# Registro de viajes — instalación (≈10 minutos, una sola vez)

App instalable (PWA) para registrar viajes empresariales. Todo se guarda primero en tu teléfono y se sincroniza con tu Google Sheet «Mis finanzas» mediante el **mismo script de Apps Script** que usa la app de gastos: las pestañas **Viajes**, **Personas** y **Tarifas** de esa hoja son la base de datos.

## 1. Actualizar el script de tu Sheet (un solo script para las dos apps)
1. Abre tu Sheet «Mis finanzas» → Extensiones → Apps Script.
2. Antes de borrar nada, copia tu código secreto (la línea `var TOKEN = '...'`).
3. Borra lo que haya y pega todo el contenido de `apps-script.gs` de este repositorio.
4. En la línea `var TOKEN = 'CAMBIA-ESTE-CODIGO'` pon **el mismo código secreto que ya usas en «Mis finanzas»**.
5. Implementar → Administrar implementaciones → lápiz → Versión: **Nueva versión** → Implementar. La URL no cambia, así que «Mis finanzas» sigue funcionando sin tocar nada.

> `apps-script.gs` incluye, sin cambios, el código de «Mis finanzas» (repositorio `mis-finanzas`) más la parte de viajes. Si tu script de gastos tiene cambios propios que no están en ese repositorio, compáralos antes de reemplazar.

## 2. Pestañas de la hoja
Tu Sheet ya tiene las pestañas **Viajes**, **Personas** y **Tarifas** (con sus encabezados). No cambies el orden de las columnas de Viajes (A a J) ni borres la columna A: ahí vive el identificador de cada viaje (`t_…`).

## 3. Publicar la app (gratis, con GitHub Pages)
En GitHub: repositorio `registro_viajes` → Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / carpeta `/ (root)` → Save. En un par de minutos queda en `https://miguelsanchezzam-hub.github.io/registro_viajes/`.

## 4. Instalar en el iPhone
Abre esa dirección en Safari → Compartir → «Añadir a pantalla de inicio».

## 5. Conectar con la hoja
Toca el **engrane** de arriba a la derecha (Configuración) → en «Conexión con Google Sheet» pega la **URL del script** (la que termina en `/exec`, la misma de «Mis finanzas») y el **código secreto** → Probar conexión → Guardar. El engrane se ve en color normal cuando todo está conectado y en **rojo** si el script no está configurado o no responde. Ahí mismo están las **Personas** y las **Tarifas**.

**Historial:** la pestaña de abajo muestra tus viajes por semana, mes o año, con indicadores (total, promedios, mejor día, comparación con el periodo anterior, tipo y persona más frecuentes, horas más movidas) y sus gráficas.

## Cómo sincroniza
- Cada viaje, persona o tarifa se guarda primero en el dispositivo (funciona sin internet).
- Se envía al script al abrir la app, cada minuto mientras está abierta, al guardar, editar o borrar algo, y al tocar «Sincronizar ahora». El botón de arriba muestra el estado: *Hoja al día*, *Por enviar*, *Sincronizando…* o *Sin sincronizar* (con el motivo).
- Editar un viaje actualiza **su misma fila** en la hoja; borrarlo borra la fila.
- Lo que cambies **a mano** en la hoja (una tarifa, una persona, una fila de Viajes con su `t_…` en la columna A) llega a la app en la siguiente sincronización.
- Varios dispositivos: instala la app en cada uno y pega la misma URL y el mismo código. Si dos dispositivos cambian personas o tarifas a la vez, gana el último cambio.
- La app solo lee las filas de Viajes cuya columna A empieza con `t_`.

## Cambiar el código de la app
El código fuente está en `fuente/`. Para volver a generar `index.html`:

```
cd fuente
bun install
bash build.sh
```

Después sube los cambios a GitHub (`index.html` es lo que publica GitHub Pages). Si cambias algo que deba actualizarse en los teléfonos, sube también el número de versión de la caché en `sw.js` (`viajes-v1` → `viajes-v2`).

## Datos de prueba
Los viajes que hayas registrado en la versión de prueba (artefacto de Claude) no se pasan solos a esta app; si quieres conservarlos, pídele a Claude que los copie a la pestaña Viajes.
