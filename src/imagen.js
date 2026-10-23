// Generación de imágenes.
// Por defecto usa Workers AI de Cloudflare (FLUX.2), que es gratis hasta el límite diario de la cuenta
// y no necesita tarjeta ni llave. Si se configura el secreto GEMINI_API_KEY, usa Google Gemini.
// Workers AI: https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/
// Gemini: https://ai.google.dev/gemini-api/docs/image-generation

export const FORMATOS = ['1:1', '4:5', '3:4', '16:9', '9:16'];

// Tamaños en píxeles para Workers AI (múltiplos de 16, entre 256 y 1920).
const TAMANOS = {
  '1:1': [1024, 1024],
  '4:5': [912, 1136],
  '3:4': [880, 1168],
  '16:9': [1360, 768],
  '9:16': [768, 1360],
};

export const MODELO_WORKERS_AI = '@cf/black-forest-labs/flux-2-klein-4b';

export function proveedorImagenes(env) {
  return env.GEMINI_API_KEY
    ? { nombre: 'Google Gemini', modelo: env.GEMINI_MODEL || 'gemini-3.1-flash-lite-image', gratis: false }
    : { nombre: 'Cloudflare Workers AI', modelo: env.IMAGEN_MODELO || MODELO_WORKERS_AI, gratis: true };
}

function tipoDesdeBase64(base64) {
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

async function generarConWorkersAI(env, prompt, formato) {
  if (!env.AI) throw new Error('Falta la conexión con Workers AI (binding "AI" en wrangler.jsonc).');
  const [ancho, alto] = TAMANOS[formato] || TAMANOS['1:1'];
  // Los modelos FLUX.2 en Workers AI reciben un formulario multipart.
  const formulario = new FormData();
  formulario.append('prompt', prompt.slice(0, 2000));
  formulario.append('width', String(ancho));
  formulario.append('height', String(alto));
  const cuerpo = new Response(formulario);

  let respuesta;
  try {
    respuesta = await env.AI.run(env.IMAGEN_MODELO || MODELO_WORKERS_AI, {
      multipart: { body: cuerpo.body, contentType: cuerpo.headers.get('content-type') },
    });
  } catch (e) {
    const mensaje = String(e?.message || e);
    if (/4006|neurons|allocation|quota/i.test(mensaje)) {
      throw new Error('Se acabó el cupo gratis de imágenes de hoy. Se renueva todos los días a las 7:00 p. m. (hora de Colombia).');
    }
    throw new Error(`Workers AI no pudo generar la imagen: ${mensaje}`);
  }
  const base64 = respuesta?.image;
  if (!base64) throw new Error('Workers AI no devolvió imagen. Intenta de nuevo o cambia la indicación.');
  return { base64, tipo: tipoDesdeBase64(base64) };
}

export function armarPrompt(plantilla, titulo, ajuste) {
  let prompt = plantilla.replaceAll('{titulo}', titulo);
  if (!plantilla.includes('{titulo}')) prompt += `\n\nTraining course title: "${titulo}".`;
  if (ajuste) prompt += `\n\nAdditional direction (may be written in Spanish): ${ajuste}`;
  return prompt;
}

// Devuelve { base64, tipo }. El navegador la comprime antes de guardarla (ver public/app.js).
export async function generarImagen(env, prompt, formato) {
  if (env.IMAGEN_DE_PRUEBA === '1' && !env.GEMINI_API_KEY) return imagenDePrueba();
  if (!env.GEMINI_API_KEY) return generarConWorkersAI(env, prompt, formato);

  const modelo = env.GEMINI_MODEL || 'gemini-3.1-flash-lite-image';
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
  return { base64: inline.data, tipo: inline.mimeType || inline.mime_type || 'image/png' };
}

// Imagen gris de 1x1 para probar en el computador sin gastar créditos.
function imagenDePrueba() {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoaGgAAAMEAYFL09IQAAAAAElFTkSuQmCC';
  return { base64: png, tipo: 'image/png' };
}
