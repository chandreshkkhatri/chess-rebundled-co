const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const { loadSource, hookHarness, jsx } = require('./helpers.cjs');

// Renders the real input panel with the speech hooks replaced by controllable
// stand-ins, so recognizer callbacks and listening changes can be driven directly.
function fixture() {
  const runtime = hookHarness();
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
    './VoiceDebugOverlay': { VoiceDebugOverlay: () => null },
    './AudioWaveform': { AudioWaveform: () => null },
  });
  const calls = { submit: [], server: [] };
  const props = {
    fen: new Chess().fen(), isActive: true, isSubmitting: false, inputMode: 'voice-tap',
    voiceParsingMode: 'webspeech-haiku', autoSubmitEnabled: false,
    aiParseResult: null, aiParseError: null, isAIParsing: false,
    onMoveSubmit: (...args) => calls.submit.push(args),
    onParseMoveWithText: (...args) => calls.server.push(args),
    onParseMoveWithAudio: () => {}, clearAIParseState: () => {},
  };
  const render = () => runtime.render(() => UniversalInputPanel(props));
  const text = tree => {
    if (tree == null || typeof tree === 'boolean') return '';
    if (typeof tree !== 'object') return String(tree);
    if (Array.isArray(tree)) return tree.map(text).join(' ');
    return text(tree.props?.children);
  };
  return {
    speech, calls, props, render, text: () => text(render()),
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
