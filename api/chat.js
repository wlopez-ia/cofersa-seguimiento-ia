// api/chat.js
// Endpoint: POST /api/chat
// Body: { pregunta: string, resumen: { diasTotales, diasTranscurridos, filas: [...] } }
//
// Usa la API gratuita de Google Gemini (Google AI Studio). Guarda la llave en el
// servidor (variable de entorno GEMINI_API_KEY en Vercel) — el navegador del
// usuario nunca la ve. No requiere tarjeta de crédito.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido, usa POST" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta configurar GEMINI_API_KEY en Vercel" });
    return;
  }

  const { pregunta, resumen } = req.body || {};
  if (!pregunta || !resumen) {
    res.status(400).json({ error: "Falta 'pregunta' o 'resumen' en el cuerpo de la solicitud" });
    return;
  }

  const systemPrompt = `Eres el asistente comercial de Cofersa. Respondes preguntas sobre el cumplimiento de venta del mes en curso, usando ÚNICAMENTE los datos que se te entregan abajo. No inventes cifras que no estén ahí.

Contexto: hoy es el día hábil ${resumen.diasTranscurridos} de ${resumen.diasTotales} del mes. "Meta" es la meta mensual completa. "Venta" es lo vendido hasta hoy. "Semáforo" indica el ritmo: verde (>=95% del ritmo esperado a la fecha), ambar (80-95%), rojo (<80%), sin-meta (vende pero no tiene meta asignada en el forecast). "Proyección" es una proyección lineal de cierre de mes basada en el ritmo actual.

Resumen por vendedor (formato [vendedor, meta, venta, semáforo, proyección]):
${JSON.stringify(resumen.resumenVendedores)}

Detalle por marca de los vendedores relevantes a esta pregunta (formato [vendedor, marca, meta, venta, semáforo, proyección]) — si la pregunta es sobre alguien que no aparece aquí ni en el resumen de arriba, dilo claramente en vez de inventar:
${JSON.stringify(resumen.detalleMarcas)}

Responde en español, de forma breve y directa, como lo haría un gerente comercial hablando con otro.`;

  try {
    const modelo = "gemini-2.0-flash";
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: String(pregunta) }] }],
          generationConfig: { maxOutputTokens: 700 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      if (geminiRes.status === 429) {
        res.status(200).json({
          respuesta: "Se alcanzó el límite gratuito de preguntas por minuto. Espera unos 30-60 segundos y vuelve a intentar."
        });
        return;
      }
      let mensaje = "No se pudo obtener respuesta de Gemini.";
      try {
        const parsed = JSON.parse(errText);
        mensaje = parsed.error?.message || mensaje;
      } catch (_) {}
      res.status(200).json({ respuesta: "Hubo un problema: " + mensaje });
      return;
    }

    const data = await geminiRes.json();
    const respuesta =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("\n").trim() ||
      "No obtuve una respuesta clara.";

    res.status(200).json({ respuesta });
  } catch (err) {
    res.status(500).json({ error: "Error llamando a Gemini: " + err.message });
  }
}
