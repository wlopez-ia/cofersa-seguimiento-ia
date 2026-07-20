// api/chat.js
// Endpoint: POST /api/chat
// Body: { pregunta: string, resumen: { diasTotales, diasTranscurridos, filas: [...] } }
//
// Guarda la llave de Anthropic en el servidor (variable de entorno ANTHROPIC_API_KEY
// en el panel de Vercel: Project Settings -> Environment Variables). El navegador
// del usuario nunca ve esa llave.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido, usa POST" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Falta configurar ANTHROPIC_API_KEY en Vercel" });
    return;
  }

  const { pregunta, resumen } = req.body || {};
  if (!pregunta || !resumen) {
    res.status(400).json({ error: "Falta 'pregunta' o 'resumen' en el cuerpo de la solicitud" });
    return;
  }

  const systemPrompt = `Eres el asistente comercial de Cofersa. Respondes preguntas sobre el cumplimiento de venta del mes en curso, usando ÚNICAMENTE los datos que se te entregan abajo. No inventes cifras que no estén ahí.

Contexto: hoy es el día hábil ${resumen.diasTranscurridos} de ${resumen.diasTotales} del mes. "Meta" es la meta mensual completa. "Venta" es lo vendido hasta hoy. "Semáforo" indica el ritmo: verde (>=95% del ritmo esperado a la fecha), ambar (80-95%), rojo (<80%), sin-meta (vende pero no tiene meta asignada en el forecast). "Proyección" es una proyección lineal de cierre de mes basada en el ritmo actual.

Datos (formato [vendedor, marca, meta, venta, semáforo, proyección]):
${JSON.stringify(resumen.filas)}

Responde en español, de forma breve y directa, como lo haría un gerente comercial hablando con otro. Si preguntan por alguien o alguna marca que no aparece en los datos, dilo claramente en vez de inventar.`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: "user", content: String(pregunta) }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      res.status(502).json({ error: "Anthropic API error: " + errText });
      return;
    }

    const data = await anthropicRes.json();
    const respuesta = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    res.status(200).json({ respuesta: respuesta || "No obtuve una respuesta clara." });
  } catch (err) {
    res.status(500).json({ error: "Error llamando a Anthropic: " + err.message });
  }
}
