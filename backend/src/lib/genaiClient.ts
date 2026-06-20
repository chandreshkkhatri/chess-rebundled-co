import { GoogleGenAI, type GoogleGenAIOptions } from "@google/genai";

/**
 * Shared Google Gen AI client.
 *
 * Supports two backends via env, selected without code changes:
 *
 *  - Gemini Developer API (AI Studio) — default. Uses GOOGLE_API_KEY.
 *  - Gemini Enterprise Agent Platform (formerly Vertex AI) — set
 *    GOOGLE_GENAI_USE_VERTEXAI=true. Authenticates as a GCP service account
 *    (NOT an API key) and requires GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION.
 *
 * Vertex auth: rather than relying on Application Default Credentials being
 * present in the environment, we reuse the Firebase Admin service account
 * (FIREBASE_* env vars) — a Firebase service account is a GCP service account,
 * so the same key authenticates to Vertex once it's granted roles/aiplatform.user.
 * If those vars are absent we fall back to ADC (e.g. an attached GCP identity).
 *
 * The `generateContent` surface is identical across both backends, so callers
 * don't need to know which one is active.
 */
const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";

function buildVertexOptions(): GoogleGenAIOptions {
  const options: GoogleGenAIOptions = {
    vertexai: true,
    project: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
    location: process.env.GOOGLE_CLOUD_LOCATION,
  };

  // Reuse the Firebase service account for Vertex auth when available, so no
  // separate key file / GOOGLE_APPLICATION_CREDENTIALS is needed.
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Private key is stored with escaped newlines in env; unescape to PEM form.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    options.googleAuthOptions = {
      credentials: { client_email: clientEmail, private_key: privateKey },
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
