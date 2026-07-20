// api/chat.js
// Endpoint: POST /api/chat
// Body: { pregunta: string, resumen: { diasTotales, diasTranscurridos, resumenVendedores, detalleMarcas } }
//
// Usa la API gratuita de Groq (console.groq.com). Guarda la llave en el
// servidor (variable de entorno GROQ_API_KEY en Vercel) — el navegador del
// usuario nunca la ve. No requiere tarjeta de crédito.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido, usa POST" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta configurar GROQ_API_KEY en Vercel" });
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
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 700,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: String(pregunta) }
        ]
      })
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      if (groqRes.status === 429) {
        res.status(200).json({
          respuesta: "Se alcanzó el límite gratuito de preguntas por minuto. Espera unos 30-60 segundos y vuelve a intentar."
        });
        return;
      }
      let mensaje = "No se pudo obtener respuesta del asistente.";
      try {
        const parsed = JSON.parse(errText);
        mensaje = parsed.error?.message || mensaje;
      } catch (_) {}
      res.status(200).json({ respuesta: "Hubo un problema: " + mensaje });
      return;
    }

    const data = await groqRes.json();
    const respuesta = data.choices?.[0]?.message?.content?.trim() || "No obtuve una respuesta clara.";
    res.status(200).json({ respuesta });
  } catch (err) {
    res.status(500).json({ error: "Error llamando a Groq: " + err.message });
  }
}
