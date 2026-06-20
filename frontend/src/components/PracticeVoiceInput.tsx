"use client";

import { usePracticeStore } from "@/stores/practiceStore";
import { usePracticeSocket } from "@/hooks/usePracticeSocket";
import { UniversalInputPanel } from "./UniversalInputPanel";

interface PracticeVoiceInputProps {
  onMoveSubmit: (move: string, confidence: number) => void;
  disabled?: boolean;
  showDebugPanel?: boolean;
  onCloseDebugPanel?: () => void;
}

export function PracticeVoiceInput({
  onMoveSubmit,
  disabled = false,
  showDebugPanel = false,
  onCloseDebugPanel,
}: PracticeVoiceInputProps) {
  const {
    status,
    lastMoveResult,
    isSubmitting,
    sessionId,
    aiParseResult,
    aiParseError,
    isAIParsing,
    clearAIParseState,
    clearLastMoveResult,
    voiceParsingMode,
    currentPosition,
    autoSubmitEnabled,
    inputMode,
    pendingOpponentMove,
  } = usePracticeStore();

  const { parseMoveWithAI, parseAudioMoveWithGemini } = usePracticeSocket();
  const isActive = status === "playing" && !disabled;

  return (
    <UniversalInputPanel
      fen={currentPosition || ""}
      isActive={isActive}
      isSubmitting={isSubmitting}
      inputMode={inputMode}
      voiceParsingMode={voiceParsingMode}
      autoSubmitEnabled={autoSubmitEnabled}
      pendingOpponentMove={pendingOpponentMove}
      lastMoveResult={lastMoveResult}
      aiParseResult={aiParseResult}
      aiParseError={aiParseError}
      isAIParsing={isAIParsing}
      onMoveSubmit={onMoveSubmit}
      onParseMoveWithText={(text, rawTranscript) => {
        if (sessionId) {
          parseMoveWithAI(sessionId, text, rawTranscript);
        }
      }}
      onParseMoveWithAudio={(audioBase64, mimeType) => {
        if (sessionId) {
          parseAudioMoveWithGemini(sessionId, audioBase64, mimeType);
        }
      }}
      clearAIParseState={clearAIParseState}
      clearLastMoveResult={clearLastMoveResult}
      showDebugPanel={showDebugPanel}
      onCloseDebugPanel={onCloseDebugPanel}
    />
  );
}
