'use client';

interface PracticeVoiceStatusProps {
    isRecording: boolean;
    isListening: boolean;
    isAIParsing: boolean;
    isActive: boolean;
    rawTranscript: string;
}

export function PracticeVoiceStatus({
    isRecording,
    isListening,
    isAIParsing,
    isActive,
    rawTranscript,
}: PracticeVoiceStatusProps) {
    return (
        <div className="flex items-center gap-1.5 ml-auto bg-slate-900/50 py-1 px-2 rounded-full">
            <div
                className={`w-2 h-2 rounded-full ${isRecording
                        ? 'bg-red-600 animate-pulse'
                        : isListening
                            ? 'bg-red-500 animate-pulse'
                            : isAIParsing
                                ? 'bg-yellow-500 animate-pulse'
                                : isActive
                                    ? 'bg-green-400'
                                    : 'bg-slate-600'
                    }`}
            />
            <span className={`text-xs font-medium ${isRecording ? 'text-red-400' : isListening ? 'text-red-400' : isAIParsing ? 'text-yellow-400' : 'text-slate-400'}`}>
                {isRecording ? 'Recording' : isListening ? 'Listening' : isAIParsing ? 'Parsing' : rawTranscript ? 'Ready' : isActive ? 'Ready' : 'Waiting'}
            </span>
        </div>
    );
}
