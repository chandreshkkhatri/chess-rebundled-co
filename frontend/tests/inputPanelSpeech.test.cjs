const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { loadSource, hookHarness, jsx } = require('./helpers.cjs');

// Renders the real input panel with the speech hooks replaced by controllable
// stand-ins, so recognizer callbacks and listening changes can be driven directly.
// `recording`/`browserSpeech` set what the fake browser supports; `geminiStatus`
// is what the server reports about Gemini audio.
function fixture({ recording = true, browserSpeech = true, geminiStatus = { available: true, reason: null } } = {}) {
  const runtime = hookHarness();
  const refreshes = [];
  const speechAvailability = {
    useGeminiAudioStatus: () => geminiStatus,
    refreshGeminiAudioStatus: (options = {}) => { refreshes.push(options); return Promise.resolve(); },
  };
  const browser = {
    window: {
      ...(browserSpeech ? { webkitSpeechRecognition: function () {} } : {}),
      ...(recording ? { MediaRecorder: function () {}, AudioContext: function () {} } : {}),
    },
    navigator: recording ? { mediaDevices: { getUserMedia() {} } } : {},
  };
  const speech = { isListening: true, onResult: null, stopIdentity: 0 };
  let stopFn = () => {};
  const useVoiceRecognition = options => {
    speech.onResult = options.onResult;
    return {
      isSupported: true, isListening: speech.isListening, parsedPreview: '', error: null,
      startListening: () => { speech.isListening = true; }, stopListening: stopFn,
    };
  };
  // Like the real hook, the idle Gemini recorder keeps stable callbacks.
  const gemini = {
    isSupported: true, isListening: false, isRecording: false, error: null,
    startListening: () => {}, stopListening: () => {}, volumeLevel: 0, silenceThreshold: 0.02,
  };
  const useGeminiVoice = () => gemini;
  const stageParser = loadSource('src/lib/moveStageParser.ts', {
    'chess.js': { Chess }, './distractorGenerator': loadSource('src/lib/distractorGenerator.ts'),
  });
  const { UniversalInputPanel } = loadSource('src/components/UniversalInputPanel.tsx', {
    react: runtime.react, 'react/jsx-runtime': jsx, 'chess.js': { Chess },
    '@/hooks/useVoiceRecognition': { useVoiceRecognition },
    '@/hooks/useGeminiVoice': { useGeminiVoice },
    '@/lib/moveStageParser': stageParser,
    '@/lib/spokenMoveMatcher': loadSource('src/lib/spokenMoveMatcher.ts'),
    '@/lib/speechAvailability': speechAvailability,
    './VoiceDebugOverlay': { VoiceDebugOverlay: () => null },
    './AudioWaveform': { AudioWaveform: () => null },
  }, browser);
  const calls = { submit: [], server: [], modes: [] };
  const props = {
    fen: new Chess().fen(), isActive: true, isSubmitting: false, inputMode: 'voice-tap',
    voiceParsingMode: 'webspeech-haiku', autoSubmitEnabled: false,
    aiParseResult: null, aiParseError: null, isAIParsing: false,
    onMoveSubmit: (...args) => calls.submit.push(args),
    onParseMoveWithText: (...args) => calls.server.push(args),
    onParseMoveWithAudio: () => {}, clearAIParseState: () => {},
    onVoiceParsingModeChange: mode => calls.modes.push(mode),
  };
  const render = () => runtime.render(() => UniversalInputPanel(props));
  const text = tree => {
    if (tree == null || typeof tree === 'boolean') return '';
    if (typeof tree !== 'object') return String(tree);
    if (Array.isArray(tree)) return tree.map(text).join(' ');
    return text(tree.props?.children);
  };
  const findToggle = tree => {
    if (!tree || typeof tree !== 'object') return null;
    if (Array.isArray(tree)) { for (const child of tree) { const hit = findToggle(child); if (hit) return hit; } return null; }
    if (String(tree.props?.['aria-label'] ?? '').startsWith('Voice engine')) return tree;
    return findToggle(tree.props?.children);
  };
  return {
    speech, calls, props, refreshes, render, text: () => text(render()),
    toggle: () => { const button = findToggle(render()); return button && { ...button.props, label: text(button) }; },
    // Listening ends (mobile Chrome ends the session after each phrase): the
    // hook reports it and its stop callback gets a new identity.
    endSession() { speech.isListening = false; stopFn = () => {}; render(); },
  };
}

test('a locally matched move survives the recognition session ending', () => {
  const f = fixture();
  f.render();
  f.speech.onResult('Nf3', 1, 'knight f3', ['knight f3']);
  assert.match(f.text(), /Interpreted:\s+Nf3/);
  f.endSession();
  assert.match(f.text(), /Interpreted:\s+Nf3/, 'the parse is still shown');
  assert.match(f.text(), /Submit\s+Nf3/, 'the move is still selected for submission');
  assert.equal(f.calls.server.length, 0, 'a confident match needs no server request');
});

test('an unclear phrase is sent to the server with every recognizer guess', () => {
  const f = fixture();
  f.render();
  f.speech.onResult('b4', 0.75, 'bee four', ['bee four', 'd4']);
  f.render();
  assert.equal(f.calls.server.length, 1);
  assert.deepEqual([...f.calls.server[0][2]], ['bee four', 'd4']);
});

test('switching the voice mode still clears the previous parse', () => {
  const f = fixture();
  f.render();
  f.speech.onResult('Nf3', 1, 'knight f3', ['knight f3']);
  assert.match(f.text(), /Interpreted:\s+Nf3/);
  f.props.voiceParsingMode = 'gemini-audio';
  assert.doesNotMatch(f.text(), /Nf3/);
});

test('a parse with no move shows the reason instead of a bare question mark', () => {
  const f = fixture();
  f.props.aiParseResult = {
    parsedMove: '', transcript: '[audio input]', confidence: 0, alternatives: [],
    reasoning: 'Audio parsing failed: Gemini audio parse timed out after 12000ms',
  };
  const shown = f.text();
  assert.match(shown, /Interpreted:\s+\?/);
  assert.match(shown, /Audio parsing failed: Gemini audio parse timed out after 12000ms/);

  // A found move, or alternatives to pick from, keep the panel as before.
  f.props.aiParseResult = { ...f.props.aiParseResult, parsedMove: 'e4', confidence: 0.95, reasoning: 'Heard echo four' };
  assert.doesNotMatch(f.text(), /Heard echo four/);
  f.props.aiParseResult = { parsedMove: '', transcript: 'bee four', confidence: 0.3, alternatives: ['b4', 'd4'], reasoning: 'unclear' };
  assert.doesNotMatch(f.text(), /unclear/);
  assert.match(f.text(), /Did you mean:/);
});

test('the voice engine toggle switches between browser speech and Gemini audio', () => {
  const f = fixture();
  let toggle = f.toggle();
  assert.match(toggle.label, /Voice\s+Browser/);
  assert.equal(toggle.disabled, false);
  toggle.onClick();
  assert.deepEqual(f.calls.modes, ['gemini-audio']);

  f.props.voiceParsingMode = 'gemini-audio';
  toggle = f.toggle();
  assert.match(toggle.label, /Voice\s+Gemini/);
  toggle.onClick();
  assert.deepEqual(f.calls.modes, ['gemini-audio', 'webspeech-haiku']);
  assert.ok(f.refreshes.length > 0, 'the panel asks whether Gemini audio is available');

  // Pages without a handler (and tap-only input) show no toggle.
  delete f.props.onVoiceParsingModeChange;
  assert.equal(f.toggle(), null);
});

test('when the server reports Gemini audio unavailable, the panel uses browser speech and says why', () => {
  const f = fixture({ geminiStatus: { available: false, reason: 'Gemini audio is failing right now.' } });
  f.props.voiceParsingMode = 'gemini-audio';
  const shown = f.text();
  assert.match(shown, /Gemini audio is failing right now\. Using browser speech\./);
  const toggle = f.toggle();
  assert.match(toggle.label, /Browser/);
  assert.equal(toggle.disabled, true, 'Gemini cannot be chosen while unavailable');
  assert.match(toggle.title, /failing right now/);
  // Browser speech is really in use: a spoken move is matched by the browser path.
  f.speech.onResult('Nf3', 1, 'knight f3', ['knight f3']);
  assert.match(f.text(), /Interpreted:\s+Nf3/);
  assert.deepEqual(f.calls.modes, [], 'the saved preference is kept for when Gemini recovers');
});

test('a browser that cannot record audio falls back to browser speech', () => {
  const f = fixture({ recording: false });
  f.props.voiceParsingMode = 'gemini-audio';
  assert.match(f.text(), /This browser cannot record audio for Gemini\. Using browser speech\./);
  assert.equal(f.toggle().disabled, true);
});

test('a Gemini parse that found no move re-checks whether Gemini audio is available', () => {
  const f = fixture();
  f.props.voiceParsingMode = 'gemini-audio';
  f.render();
  const before = f.refreshes.length;
  f.props.aiParseResult = { parsedMove: '', transcript: '[audio input]', confidence: 0, alternatives: [], reasoning: 'Audio parsing failed: timeout' };
  f.render();
  assert.deepEqual(JSON.parse(JSON.stringify(f.refreshes.slice(before))), [{ force: true }]);
});
