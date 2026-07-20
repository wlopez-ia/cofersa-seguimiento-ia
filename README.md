# Seguimiento con IA — Cofersa

Extiende el dashboard de cumplimiento por marca con un asistente conversacional
y alertas diarias por correo. Lee la misma hoja de Google que ya usa el sitio
de ventas (`seguimientoventasdiarias.vercel.app`) — no la modifica, solo la consulta.

## Qué incluye

- `public/index.html` — el dashboard (metas por marca, semáforo, proyección de cierre, alertas en pantalla, chat).
- `api/chat.js` — recibe una pregunta + el resumen de datos, la responde con Claude. Aquí vive la llave de Anthropic, nunca en el navegador.
- `api/alertas-diarias.js` — job que revisa quién está en rojo y envía un correo con Resend. Se ejecuta solo, todos los días hábiles.
- `lib/metas.js` — las metas por vendedor+marca extraídas de tu Forecast Q3 2026 (columna G/H/I de `7_Vend_Marca`).

## Publicarlo (una sola vez)

1. Crea una cuenta/proyecto en [vercel.com](https://vercel.com) si no tienes uno para esto (puede ser el mismo que ya usan).
2. Sube esta carpeta a un repositorio de GitHub, o usa `vercel deploy` desde tu computadora con la [CLI de Vercel](https://vercel.com/docs/cli) parado dentro de esta carpeta.
3. En el panel del proyecto en Vercel, ve a **Settings → Environment Variables** y agrega:
   - `ANTHROPIC_API_KEY` → tu llave de la API de Anthropic (la sacas en [console.anthropic.com](https://console.anthropic.com)).
   - `RESEND_API_KEY` → tu llave de Resend (solo si quieres las alertas por correo).
   - `CORREO_DESTINO` → a quién le llega el correo de alertas, ej: `gerente@cofersa.com,supervisor@cofersa.com`
4. Vuelve a desplegar (Vercel lo hace automático al detectar las variables nuevas, o dale "Redeploy").
5. En `api/alertas-diarias.js`, cambia `alertas@tu-dominio-verificado.com` por un remitente de un dominio que hayas verificado en Resend.

## Actualizar las metas cada trimestre

Cuando tengan un nuevo Forecast, hay que regenerar `lib/metas.js` con las
metas del vendedor+marca del mes correspondiente (columnas de meta del
Forecast). Pídemelo cuando llegue el momento y te dejo el archivo listo.

## Notas de seguridad

- La llave de Google Sheets que se usa para leer la hoja de venta está
  incrustada en el HTML porque es de solo lectura y ya viaja expuesta en el
  sitio original — no es una credencial sensible en sí misma, pero vale la
  pena que quien administre esa hoja confirme que el acceso está bien
  restringido (solo lectura, sin permisos de edición).
- La llave de Anthropic y la de Resend SÍ son sensibles — por eso viven solo
  como variables de entorno en Vercel, nunca en el HTML.
