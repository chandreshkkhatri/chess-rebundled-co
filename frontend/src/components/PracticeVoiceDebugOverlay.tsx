'use client';

interface PracticeVoiceDebugOverlayProps {
    volumeLevel: number;
    silenceThreshold: number;
    isListening: boolean;
    isRecording: boolean;
    isActive: boolean;
    voiceParsingMode: string;
}

export function PracticeVoiceDebugOverlay({
    volumeLevel,
    silenceThreshold,
    isListening,
    isRecording,
    isActive,
    voiceParsingMode,
}: PracticeVoiceDebugOverlayProps) {
    return (
        <div className="fixed bottom-4 right-4 bg-black/90 text-white p-3 rounded-lg font-mono text-xs z-50 min-w-[200px] border border-green-500/50">
            <div className="text-green-400 font-bold mb-2">🎤 Audio Debug</div>

            {/* Volume bar */}
            <div className="mb-2">
                <div className="flex justify-between mb-1">
                    <span>Volume:</span>
                    <span>{(volumeLevel * 100).toFixed(1)}%</span>
                </div>
                <div className="h-3 bg-slate-700 rounded overflow-hidden relative">
                    {/* Threshold marker */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-yellow-400 z-10"
                        style={{ left: `${silenceThreshold * 100}%` }}
                    />
                    {/* Volume level */}
                    <div
                        className={`h-full transition-all duration-75 ${volumeLevel > silenceThreshold ? 'bg-green-500' : 'bg-red-500'
                            }`}
                        style={{ width: `${Math.min(volumeLevel * 100, 100)}%` }}
                    />
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                    Threshold: {(silenceThreshold * 100).toFixed(1)}% (yellow line)
                </div>
            </div>

            {/* States */}
            <div className="space-y-1">
                <div className="flex justify-between">
                    <span>Listening:</span>
                    <span className={isListening ? 'text-green-400' : 'text-red-400'}>
                        {isListening ? 'YES' : 'NO'}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Recording:</span>
                    <span className={isRecording ? 'text-green-400 animate-pulse' : 'text-red-400'}>
                        {isRecording ? 'YES' : 'NO'}
                    </span>
                </div>
                <div className="flex justify-between">
                    <span>Mode:</span>
                    <span className="text-blue-400">{voiceParsingMode}</span>
                </div>
                <div className="flex justify-between">
                    <span>Active:</span>
                    <span className={isActive ? 'text-green-400' : 'text-red-400'}>
                        {isActive ? 'YES' : 'NO'}
                    </span>
                </div>
            </div>
        </div>
    );
}
