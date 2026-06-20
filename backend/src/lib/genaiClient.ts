import { GoogleGenAI, type GoogleGenAIOptions } from "@google/genai";

/**
 * Shared Google Gen AI client.
 *
 * Two backends, selected via env without code changes:
 *
 *  - Gemini Developer API (AI Studio) — default. Uses GOOGLE_API_KEY and hits
 *    generativelanguage.googleapis.com.
 *  - Gemini Enterprise Agent Platform (formerly Vertex AI) — set
 *    GOOGLE_GENAI_USE_VERTEXAI=true. Hits aiplatform.googleapis.com. Two auth
 *    modes are supported here:
 *
 *      a) Express mode (preferred when GOOGLE_API_KEY is set): pass the API key
 *         WITHOUT project/location. An Agent Platform API key authenticates
 *         directly against aiplatform.googleapis.com — no service account / ADC.
 *         NOTE: the SDK gives project+location precedence over apiKey and will
 *         null the key if both are set, so express mode must omit them.
 *
 *      b) Service-account mode (no API key): project + location + credentials.
 *         We reuse the Firebase Admin service account (FIREBASE_* env vars) — a
 *         Firebase SA is a GCP SA, so it works once granted roles/aiplatform.user.
 *         Falls back to ADC if those vars are absent.
 *
 * The `generateContent` surface is identical across all of these, so callers
 * don't need to know which one is active.
 */
const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";

function buildVertexOptions(): GoogleGenAIOptions {
  const apiKey = process.env.GOOGLE_API_KEY;

  // (a) Express mode — API key against the Agent Platform endpoint. Must NOT
  // include project/location, or the SDK discards the key and falls back to ADC.
  if (apiKey) {
    return { vertexai: true, apiKey };
  }

  // (b) Service-account mode.
  const options: GoogleGenAIOptions = {
    vertexai: true,
    project:
      process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
    location: process.env.GOOGLE_CLOUD_LOCATION,
  };

  // Reuse the Firebase service account for Vertex auth when available, so no
  // separate key file / GOOGLE_APPLICATION_CREDENTIALS is needed.
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Private key is stored with escaped newlines in env; unescape to PEM form.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    options.googleAuthOptions = {
      credentials: { client_email: moclientEmail, private_key: privateKey },
    };
  }

  return options;
}

export const genai = useVertex
  ? new GoogleGenAI(buildVertexOptions())
  : new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Default model, overridable per-deployment. Model IDs are the same across both
// backends; just confirm availability in your chosen Vertex location.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
