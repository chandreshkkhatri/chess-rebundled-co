'use client';

import { useEffect, useState } from 'react';

interface AudioWaveformProps {
  isListening: boolean;
  isRecording: boolean;
  volumeLevel: number; // 0 to 1
}

export function AudioWaveform({ isListening, isRecording, volumeLevel }: AudioWaveformProps) {
  const [animatedVolume, setAnimatedVolume] = useState(0);

  // Smooth out the volume changes slightly for a better visual effect
  useEffect(() => {
    let animationFrameId: number;
    let time = 0;
    
    const smooth = () => {
      setAnimatedVolume((prev) => {
        // If volumeLevel is static/zero, use a gentle sine wave to keep it alive
        const targetVolume = volumeLevel > 0 
          ? volumeLevel 
          : (Math.sin(time) + 1) * 0.08 + 0.02;
        
        const diff = targetVolume - prev;
        // Adjust interpolation factor for responsiveness vs smoothness
        return prev + diff * 0.4;
      });
      time += 0.15;
      animationFrameId = requestAnimationFrame(smooth);
    };

    if (isListening) {
      animationFrameId = requestAnimationFrame(smooth);
    } else {
      setAnimatedVolume(0);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isListening, volumeLevel]);

  if (!isListening) return null;

  // Let's create 7 bars with different baseline heights and multipliers
  const bars = [
    { base: 6, mult: 24 },
    { base: 8, mult: 36 },
    { base: 12, mult: 48 },
    { base: 16, mult: 64 }, // Center bar
    { base: 12, mult: 48 },
    { base: 8, mult: 36 },
    { base: 6, mult: 24 },
  ];

  return (
    <div className="flex items-center justify-center gap-1 h-6 px-2 py-1">
      {/* Pulse recording dot */}
      {isRecording && (
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mr-1" />
      )}
      
      {/* Waveform bars */}
      <div className="flex items-center gap-0.5 h-full">
        {bars.map((bar, index) => {
          // Calculate dynamic height based on volume level
          const calculatedHeight = bar.base + animatedVolume * bar.mult;
          const height = Math.min(24, Math.max(4, calculatedHeight));
          
          return (
            <div
              key={index}
              style={{ height: `${height}px` }}
              className={`w-0.75 rounded-full transition-all duration-75 ${
                isRecording 
                  ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' 
                  : 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]'
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
