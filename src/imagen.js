// Generación de imágenes con Google Gemini ("Nano Banana").
// Documentación: https://ai.google.dev/gemini-api/docs/image-generation

export const FORMATOS = ['1:1', '4:5', '3:4', '16:9', '9:16'];

export function armarPrompt(plantilla, titulo, ajuste) {
  let prompt = plantilla.replaceAll('{titulo}', titulo);
  if (!plantilla.includes('{titulo}')) prompt += `\n\nTraining course title: "${titulo}".`;
  if (ajuste) prompt += `\n\nAdditional direction (may be written in Spanish): ${ajuste}`;
  return prompt;
}

// Devuelve { bytes: Uint8Array, tipo: 'image/png' }.
export async function generarImagen(env, prompt, formato) {
  if (!env.GEMINI_API_KEY) {
    if (env.IMAGEN_DE_PRUEBA === '1') return imagenDePrueba();
    throw new Error('Falta la llave de Google Gemini (GEMINI_API_KEY). Ver docs/INSTALACION.md.');
  }

  const modelo = env.GEMINI_MODEL || 'gemini-2.5-flash-image';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: FORMATOS.includes(formato) ? formato : '1:1' },
        },
      }),
    },
  );

  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = datos?.error?.message || res.statusText;
    throw new Error(`Google Gemini respondió ${res.status}: ${detalle}`);
  }

  const partes = datos?.candidates?.[0]?.content?.parts || [];
  const imagen = partes.find((p) => p.inlineData?.data || p.inline_data?.data);
  if (!imagen) {
    const motivo = datos?.candidates?.[0]?.finishReason || datos?.promptFeedback?.blockReason || 'sin imagen';
    throw new Error(`Gemini no devolvió imagen (${motivo}). Intenta de nuevo o cambia el ajuste.`);
  }
  const inline = imagen.inlineData || imagen.inline_data;
  return {
    bytes: Uint8Array.from(Buffer.from(inline.data, 'base64')),
    tipo: inline.mimeType || inline.mime_type || 'image/png',
  };
}

// Imagen gris de 1x1 para probar en el computador sin gastar créditos.
function imagenDePrueba() {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaGgAAAMEAYFL09IQAAAAAElFTkSuQmCC';
  return { bytes: Uint8Array.from(Buffer.from(png, 'base64')), tipo: 'image/png' };
}
