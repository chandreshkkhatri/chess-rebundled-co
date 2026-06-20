import { GoogleGenAI } from "@google/genai";

/**
 * Shared Google Gen AI client.
 *
 * Supports two backends via env, selected without code changes:
 *
 *  - Gemini Developer API (AI Studio) — default. Uses GOOGLE_API_KEY.
 *  - Gemini Enterprise Agent Platform (formerly Vertex AI) — set
 *    GOOGLE_GENAI_USE_VERTEXAI=true. Authenticates via Application Default
 *    Credentials (a service account / attached GCP identity), NOT an API key,
 *    and requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION.
 *
 * The `generateContent` surface is identical across both backends, so callers
 * don't need to know which one is active.
 */
const useVertex = process.env.GOOGLE_GENAI_USE_VERTEXAI === "true";

export const genai = useVertex
  ? new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: process.env.GOOGLE_CLOUD_LOCATION,
    })
  : new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Default model, overridable per-deployment. Model IDs are the same across both
// backends; just confirm availability in your chosen Vertex location.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
