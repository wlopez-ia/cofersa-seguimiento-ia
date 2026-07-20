// api/alertas-diarias.js
// Job diario (Vercel Cron) que revisa el semáforo de todos los vendedores/marcas
// y envía un correo con los que están en rojo. No envía nada si todo está en orden.
//
// Configura en Vercel:
//   - Variable de entorno RESEND_API_KEY (tu llave de Resend)
//   - Variable de entorno CORREO_DESTINO (a quién le llega el resumen, separado por comas)
//   - En vercel.json, un cron que llame a este endpoint una vez al día (ver vercel.json)
//
// Este endpoint reutiliza la MISMA lógica de datos que el dashboard: lee la hoja de
// Google en vivo, resuelve zona->vendedor real, y cruza con las metas por marca.

import { METAS_MARCA } from "../lib/metas.js";

const SHEET_ID = "1wiZsk8NarqbHwEx9DITKLMeCuERLJcOdmn_KeRXpQ9k";
const SHEETS_API_KEY = "AIzaSyD48Ghbxkqd3QYcqnW7WsyB-I7LZ2dnhVo";
const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/`;

function stripPrefijo(nombre) {
  return (nombre || "").replace(/^\d+-/, "").trim().toUpperCase();
}

async function fetchRange(range) {
  const url = BASE + encodeURIComponent(range) + `?key=${SHEETS_API_KEY}&valueRenderOption=UNFORMATTED_VALUE`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("No se pudo leer " + range);
  const j = await r.json();
  return j.values || [];
}

async function calcularAlertas() {
  const [diasHabiles, dataRows, marcasVendedorRows, zonasVendedorRows] = await Promise.all([
    fetchRange("Dias Habiles!A1:B2"),
    fetchRange("DATA!A10:K"),
    fetchRange("MARCAS VENDEDOR!A2:C"),
    fetchRange("ZONAS VENDEDOR!A2:D")
  ]);

  const diasTotales = Number(diasHabiles[0][1]);
  const diasTranscurridos = Number(diasHabiles[1][1]);
  const fraccion = diasTranscurridos / diasTotales;

  const marcaPortafolio = new Map();
  marcasVendedorRows.forEach((r) => {
    if (!r || !r[0]) return;
    marcaPortafolio.set(String(r[0]).trim().toUpperCase(), String(r[2] || "").trim());
  });
  const zonaPortafolioVendedor = new Map();
  zonasVendedorRows.forEach((r) => {
    if (!r || !r[0]) return;
    zonaPortafolioVendedor.set(stripPrefijo(r[0]) + "||" + String(r[3] || "").trim(), stripPrefijo(r[2]));
  });
  function vendedorRealDe(zona, marca) {
    const portafolio = marcaPortafolio.get(marca.toUpperCase());
    if (!portafolio) return zona;
    return zonaPortafolioVendedor.get(zona + "||" + portafolio) || zona;
  }

  const headers = dataRows[0];
  const idxVend = headers.indexOf("Vendedor_Actual");
  const idxMarca = headers.indexOf("Marca");
  const idxVenta = headers.indexOf("Venta Neta Local");
  const idxComp = headers.indexOf("Compania");

  const ventaMap = new Map();
  for (let i = 1; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (!r || r[idxComp] !== "COFER") continue;
    const zona = stripPrefijo(r[idxVend]);
    const marca = (r[idxMarca] || "").trim();
    const vend = vendedorRealDe(zona, marca);
    const venta = Number(r[idxVenta]) || 0;
    const key = vend + "||" + marca;
    ventaMap.set(key, (ventaMap.get(key) || 0) + venta);
  }

  const alertas = [];
  METAS_MARCA.forEach(([vendedor, marca, metaJul]) => {
    if (!metaJul || metaJul <= 0) return;
    const venta = ventaMap.get(vendedor + "||" + marca) || 0;
    const metaProrateada = metaJul * fraccion;
    if (metaProrateada <= 0) return;
    const ritmo = venta / metaProrateada;
    if (ritmo < 0.8) {
      alertas.push({ vendedor, marca, ritmo, brecha: metaProrateada - venta });
    }
  });
  alertas.sort((a, b) => b.brecha - a.brecha);

  return { diasTotales, diasTranscurridos, alertas };
}

function fmt(n) {
  return "₡" + Math.round(n).toLocaleString("es-CR");
}

export default async function handler(req, res) {
  try {
    const { diasTotales, diasTranscurridos, alertas } = await calcularAlertas();

    if (alertas.length === 0) {
      res.status(200).json({ enviado: false, motivo: "Sin alertas hoy" });
      return;
    }

    const resendKey = process.env.RESEND_API_KEY;
    const destino = (process.env.CORREO_DESTINO || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!resendKey || destino.length === 0) {
      res.status(500).json({ error: "Falta RESEND_API_KEY o CORREO_DESTINO en Vercel" });
      return;
    }

    const filas = alertas
      .slice(0, 20)
      .map((a) => `<tr><td>${a.vendedor}</td><td>${a.marca}</td><td style="color:#c9432f;font-weight:700">${fmt(a.brecha)} bajo el ritmo</td></tr>`)
      .join("");

    const html = `
      <div style="font-family:sans-serif;max-width:600px">
        <h2>Alertas de venta — día ${diasTranscurridos} de ${diasTotales}</h2>
        <p>${alertas.length} combinación(es) vendedor/marca están por debajo del 80% del ritmo esperado:</p>
        <table style="width:100%;border-collapse:collapse" cellpadding="8">
          <thead><tr style="text-align:left;border-bottom:2px solid #ddd"><th>Vendedor</th><th>Marca</th><th>Brecha</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;

    const enviar = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Alertas Cofersa <alertas@tu-dominio-verificado.com>",
        to: destino,
        subject: `⚠️ ${alertas.length} alertas de venta — día ${diasTranscurridos}/${diasTotales}`,
        html
      })
    });

    if (!enviar.ok) {
      const t = await enviar.text();
      res.status(502).json({ error: "Resend error: " + t });
      return;
    }

    res.status(200).json({ enviado: true, total: alertas.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
