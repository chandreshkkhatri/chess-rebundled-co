/**
 * Browser capability detection for voice and audio features
 */

export interface BrowserCapabilities {
  webSpeechAPI: boolean;
  mediaRecorder: boolean;
  audioContext: boolean;
  getUserMedia: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  isSafari: boolean;
  isEdge: boolean;
  isMobile: boolean;
  voiceInputSupported: boolean;
}

/**
 * Detect browser capabilities for voice input features
 */
export function detectBrowserCapabilities(): BrowserCapabilities {
  if (typeof window === 'undefined') {
    // SSR fallback - assume no support
    return {
      webSpeechAPI: false,
      mediaRecorder: false,
      audioContext: false,
      getUserMedia: false,
      isChrome: false,
      isFirefox: false,
      isSafari: false,
      isEdge: false,
      isMobile: false,
      voiceInputSupported: false,
    };
  }

  const ua = navigator.userAgent.toLowerCase();

  // Browser detection
  const isChrome = /chrome/.test(ua) && !/edge|edg/.test(ua);
  const isFirefox = /firefox/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome/.test(ua);
  const isEdge = /edge|edg/.test(ua);
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(ua);

  // Feature detection
  const webSpeechAPI = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  const mediaRecorder = 'MediaRecorder' in window;
  const audioContext = 'AudioContext' in window || 'webkitAudioContext' in window;
  const getUserMedia = !!(navigator.mediaDevices?.getUserMedia);

  // Voice input is supported if we have Web Speech API (Chrome/Edge) OR MediaRecorder (for Gemini)
  const voiceInputSupported = webSpeechAPI || (mediaRecorder && getUserMedia);

  return {
    webSpeechAPI,
    mediaRecorder,
    audioContext,
    getUserMedia,
    isChrome,
    isFirefox,
    isSafari,
    isEdge,
    isMobile,
    voiceInputSupported,
  };
}

/**
 * Get a user-friendly message about voice input support
 */
export function getVoiceInputSupportMessage(capabilities: BrowserCapabilities): string | null {
  if (capabilities.voiceInputSupported) {
    return null; // Supported, no message needed
  }

  if (capabilities.isSafari) {
    return 'Voice input is not fully supported in Safari. For the best experience, use Chrome or Edge, or type your moves.';
  }

  if (capabilities.isFirefox) {
    return 'Voice input has limited support in Firefox. For the best experience, use Chrome or Edge, or type your moves.';
  }

  return 'Voice input is not supported in your browser. Please use Chrome or Edge for voice features, or type your moves.';
}

/**
 * Check if we should default to text-only mode
 */
export function shouldDefaultToTextMode(capabilities: BrowserCapabilities): boolean {
  // If neither Web Speech nor MediaRecorder is available, default to text mode
  return !capabilities.webSpeechAPI && !capabilities.mediaRecorder;
}
