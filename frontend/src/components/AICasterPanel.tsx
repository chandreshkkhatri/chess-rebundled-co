"use client";

import { useEffect, useState, useRef, useCallback } from "react";

export interface Caster {
  id: string;
  name: string;
  emoji: string;
  description: string;
  voicePitch: number;
  voiceRate: number;
}

export const CASTERS: Caster[] = [
  { id: "hikaru", name: "Hikaru", emoji: "👑", description: "Takes takes takes. Literally guys, GG.", voicePitch: 1.1, voiceRate: 1.25 },
  { id: "gotham", name: "GothamChess", emoji: "🎙️", description: "Dramatic chess educator. HE SACRIFICED THE ROOK!", voicePitch: 1.0, voiceRate: 1.05 },
  { id: "botez", name: "Andrea Botez", emoji: "💅", description: "High-energy streamer. Is this a Botez Gambit?", voicePitch: 1.2, voiceRate: 1.15 },
  { id: "magnus", name: "Magnus Carlsen", emoji: "🏆", description: "Elite, calm, confident grandmaster analysis.", voicePitch: 0.85, voiceRate: 0.95 },
];

// Commentary templates dictionary
const COMMENTARY_TEMPLATES: Record<string, Record<string, string[]>> = {
  hikaru: {
    opening: [
      "Okay, standard opening. Let's just develop here. Yeah, standard stuff.",
      "Okay, e4, e5, standard lines, we literally just play chess here. No big deal.",
      "So he plays that opening line. That is totally fine. Let's just castle quickly.",
    ],
    capture: [
      "And takes, takes, takes, takes. Yeah, we just takes there. That is literally free.",
      "Okay, so he takes. Let's literally just takes back. No question.",
      "Takes takes. And yeah, we are just completely winning here after that capture, guys.",
    ],
    check: [
      "Check. Okay, check. We literally just block or move the king. It's fine.",
      "Okay, he gives a check. Let's literally just block it. Easy.",
      "Oh, check. Let's step out of the way. No problem.",
    ],
    checkmate: [
      "And that is checkmate. Literally checkmate. GG, guys. We win.",
      "Boom, checkmate. He literally just blundered mate in one. GG.",
      "Checkmate! Literally, he didn't see the threat. That is GG.",
    ],
    castling: [
      "Castle. Yeah, let's keep the king safe. Standard speedrun rule.",
      "Okay, castle. Good. Now we can start the attack.",
    ],
    promotion: [
      "Okay, queen promotion. That's literally game over.",
      "Promoting to a queen. Nice, we takes the win here.",
    ],
    quiet: [
      "Okay, let's make a quiet move. Yeah, that is fine.",
      "Wait, is that a move? Yeah, that's a move. Let's play this. Literally just winning.",
      "Let's just consolidate the position here, guys. Totally fine.",
      "He plays that. Interesting, but it does literally nothing. Absolutely nothing.",
    ],
  },
  gotham: {
    opening: [
      "And the game begins! Standard lines, classic chess theory. Excellent.",
      "Okay, e4. Controlling the center immediately. A very solid choice.",
      "So we have a classic opening. Both players fighting for space early on.",
    ],
    capture: [
      "AND HE TAKES IT! A massive exchange in the center of the board!",
      "He captures the piece! The board is opening up, this is getting tactical!",
      "AND THE KNIGHT IS GONE! Capitalizing on the mistake immediately!",
    ],
    check: [
      "CHECK! The king is under fire! Where is the king going to hide?!",
      "And a direct check! Levy is hyperventilating on the sidelines!",
      "CHECK! An aggressive tactical shot! How will they respond?!",
    ],
    checkmate: [
      "AND THAT... IS CHECKMATE! HE SACRIFICED THE ROOOOOOK! BOOM!",
      "IT IS OVER! CHECKMATE! Absolute chess masterpiece on display!",
      "CHECKMATE! The king has run out of squares! What a spectacular finish!",
    ],
    castling: [
      "Castles! King safety first. A sensible, grandmaster-approved decision.",
      "Castled! Now the rooks are connected, and the attack can begin.",
    ],
    promotion: [
      "A NEW QUEEN IS BORN! That is a devastating blow!",
      "Promotion! It's a queen, and the game is effectively decided!",
    ],
    quiet: [
      "A quiet positional move. Squeezing the opponent, slowly but surely.",
      "Wait, what is that move? Is it a brilliant trap, or did he just hang a pawn?!",
      "Okay, preparing the assault. The tension is building on the board!",
      "A solid defensive move. Shutting down any hope of counterplay.",
    ],
  },
  botez: {
    opening: [
      "Oh, starting standard! Okay guys, let's focus and win this one!",
      "Okay, opening moves. Chat, what opening do you think they are playing?",
      "Developing pieces. Let's get our knights and bishops out fast!",
    ],
    capture: [
      "OMG, SHE TOOK IT! Is this a Botez Gambit?! Please tell me it's not!",
      "Wait, did he just capture my piece? Oh no, I hope we have a tactical refutation!",
      "YES! We get to capture back! Chat, is this completely winning for us?",
    ],
    check: [
      "Oh my god, check! Run! Quick, where do I move the king?!",
      "Check! Guys, is the king safe there? I'm getting nervous!",
      "A check! Wait, can we block that with a bishop? Let me think!",
    ],
    checkmate: [
      "NO WAY! CHECKMATE! WE WON! Chat, did you see that?! We are geniuses!",
      "CHECKMATE! Oh my god, that was the cleanest mating net ever!",
      "YES! Checkmate! GGs to our opponent, that was so much fun!",
    ],
    castling: [
      "Castling! Finally. I always forget king safety is important, haha.",
      "Castled! Okay, king is safe, now let's go attack their king!",
    ],
    promotion: [
      "OMG, we got a queen! Let's go! She is going to dominate the board!",
      "Queen promotion! That is absolutely huge, guys!",
    ],
    quiet: [
      "Wait, chat, is that move a blunder? Please tell me I didn't blunder.",
      "Okay, quiet move. Just setting up some sneaky bishop diagonals...",
      "Is he trying to trap me? I feel like he is playing super sneaky.",
      "Just a nice little pawn push. Keeping the position solid.",
    ],
  },
  magnus: {
    opening: [
      "e4. Yeah, it's a solid choice. Let's see how the game progresses.",
      "Standard opening theory. Nothing special, but playable.",
      "Developing pieces. It is important to control the center squares.",
    ],
    capture: [
      "Capturing the piece. It was necessary. Now we have a solid structure.",
      "He captures. We capture back. The position is slightly better for us.",
      "Taking the piece. I think they miscalculated this trade.",
    ],
    check: [
      "A check. It is easy to defend. No real danger here.",
      "Check. The king moves to a safe square. The threat is neutralized.",
      "A check. Just a temporary attack, nothing to worry about.",
    ],
    checkmate: [
      "And it is checkmate. Honestly, I didn't see any counterplay from them.",
      "Checkmate. A well-conducted endgame. GGs.",
      "And that is mate. The position was structurally winning several moves ago.",
    ],
    castling: [
      "Castles. Keeping the king safe. positional basic.",
      "Castling. Now the rooks are ready to control the open file.",
    ],
    promotion: [
      "Promotion to a queen. The endgame is completely decided now.",
      "Promoting the pawn. A very straightforward winning technique.",
    ],
    quiet: [
      "A positional improvement. Slowly improving the coordinate of my pieces.",
      "I don't think this move poses any real challenges. I will just develop.",
      "A quiet move. Sometimes you just need to wait and let them make a mistake.",
      "Squeezing the opponent. They have very few active options left.",
    ],
  },
};

interface AICasterPanelProps {
  moves: string[];
  fen: string;
}

export function AICasterPanel({ moves, fen }: AICasterPanelProps) {
  const [activeCaster, setActiveCaster] = useState<string>("hikaru");
  const [commentaryText, setCommentaryText] = useState<string>(
    "Welcome! I am your commentator today. Make a move to start!"
  );
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(false);
  const prevMoveCountRef = useRef<number>(0);
  const lastCommentsRef = useRef<Record<string, string>>({});

  // TTS utility
  const speakComment = useCallback((text: string, casterId: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const caster = CASTERS.find((c) => c.id === casterId) || CASTERS[0];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = caster.voicePitch;
    utterance.rate = caster.voiceRate;
    
    // Attempt to find a suitable English voice
    const voices = window.speechSynthesis.getVoices();
    let preferredVoice = null;
    
    if (casterId === "magnus") {
      // Find a deeper voice or UK/Norwegian if available
      preferredVoice = voices.find((v) => v.lang.includes("en-GB") && v.name.toLowerCase().includes("male"));
    } else if (casterId === "gotham") {
      preferredVoice = voices.find((v) => v.lang.includes("en-US") && v.name.toLowerCase().includes("male"));
    } else if (casterId === "botez") {
      preferredVoice = voices.find((v) => v.lang.includes("en-US") && v.name.toLowerCase().includes("female"));
    }
    
    // Fallback English voice
    if (!preferredVoice) {
      preferredVoice = voices.find((v) => v.lang.startsWith("en"));
    }

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  }, []);

  // Generate commentary based on the latest move
  const updateCommentary = useCallback((casterId: string) => {
    if (moves.length === 0) {
      const welcomeMessages: Record<string, string> = {
        hikaru: "Okay, we are ready to play. Let's literally just win this speedrun, guys.",
        gotham: "Welcome back! Levy here. The board is set, the pieces are ready. Let's see some brilliant moves!",
        botez: "Hey guys! We are live and playing chess today! Let's get that win!",
        magnus: "Welcome. Let's play a clean game and see if we can find some interesting ideas.",
      };
      setCommentaryText(welcomeMessages[casterId]);
      if (ttsEnabled) speakComment(welcomeMessages[casterId], casterId);
      return;
    }

    const lastMove = moves[moves.length - 1];
    const moveIndex = moves.length;

    // Classify move type from SAN notation
    let category = "quiet";
    if (lastMove.includes("#")) {
      category = "checkmate";
    } else if (lastMove.includes("+")) {
      category = "check";
    } else if (lastMove.includes("x")) {
      category = "capture";
    } else if (lastMove.includes("O-O")) {
      category = "castling";
    } else if (lastMove.includes("=")) {
      category = "promotion";
    } else if (moveIndex <= 4) {
      category = "opening";
    }

    const templates = COMMENTARY_TEMPLATES[casterId][category] || COMMENTARY_TEMPLATES[casterId].quiet;
    
    // Choose a random template that is different from what was said last if possible
    let comment = templates[Math.floor(Math.random() * templates.length)];
    
    // Customize template variables
    comment = comment.replace(/e4/g, lastMove);

    setCommentaryText(comment);
    lastCommentsRef.current[casterId] = comment;

    if (ttsEnabled) {
      speakComment(comment, casterId);
    }
  }, [moves, ttsEnabled, speakComment]);

  // Update when moves change
  useEffect(() => {
    if (moves.length !== prevMoveCountRef.current) {
      updateCommentary(activeCaster);
      prevMoveCountRef.current = moves.length;
    }
  }, [moves, activeCaster, updateCommentary]);

  // Update when caster changes
  const handleCasterChange = (casterId: string) => {
    setActiveCaster(casterId);
    
    // If we have a cached comment for this caster on this move, show it, else regenerate
    if (moves.length === 0) {
      updateCommentary(casterId);
    } else {
      const cached = lastCommentsRef.current[casterId];
      if (cached) {
        setCommentaryText(cached);
        if (ttsEnabled) speakComment(cached, casterId);
      } else {
        updateCommentary(casterId);
      }
    }
  };

  // Trigger TTS voice load
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      // Trigger voice load
      window.speechSynthesis.getVoices();
    }
  }, []);

  const currentCaster = CASTERS.find((c) => c.id === activeCaster) || CASTERS[0];

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 backdrop-blur-md rounded-2xl p-4 shadow-xl flex flex-col gap-4">
      
      {/* Top Selector Panel */}
      <div className="flex items-center justify-between border-b border-slate-700/50 pb-2.5">
        <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
          🎙️ Caster Commentary
        </h3>
        
        {/* TTS Toggle Button */}
        <button
          onClick={() => {
            const nextVal = !ttsEnabled;
            setTtsEnabled(nextVal);
            if (nextVal) {
              speakComment(commentaryText, activeCaster);
            } else {
              if (typeof window !== "undefined" && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
              }
            }
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
            ttsEnabled
              ? "bg-purple-600 border-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.3)]"
              : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
        >
          {ttsEnabled ? "🔊 Read Aloud: ON" : "🔇 Read Aloud: OFF"}
        </button>
      </div>

      {/* Caster Avatar Selector Buttons */}
      <div className="grid grid-cols-4 gap-1.5">
        {CASTERS.map((c) => (
          <button
            key={c.id}
            onClick={() => handleCasterChange(c.id)}
            className={`py-1.5 rounded-lg flex flex-col items-center justify-center border transition-all ${
              activeCaster === c.id
                ? "bg-purple-600/35 border-purple-500 text-white font-bold"
                : "bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-750 hover:text-slate-300"
            }`}
            title={c.description}
          >
            <span className="text-lg">{c.emoji}</span>
            <span className="text-[9px] mt-0.5 uppercase tracking-tighter truncate max-w-full px-0.5">
              {c.name}
            </span>
          </button>
        ))}
      </div>

      {/* Live Commentary bubble */}
      <div className="flex gap-3 items-start bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
        
        {/* Caster Avatar Bubble */}
        <div className="w-10 h-10 rounded-full bg-purple-900/50 border border-purple-500/30 flex items-center justify-center text-xl flex-shrink-0 select-none shadow-inner">
          {currentCaster.emoji}
        </div>
        
        {/* Speech text */}
        <div className="flex-1">
          <span className="block text-[8px] font-black text-purple-400 uppercase tracking-widest">
            {currentCaster.name}
          </span>
          <p className="text-[11px] leading-relaxed text-slate-200 mt-0.5 italic min-h-6">
            &quot;{commentaryText}&quot;
          </p>
        </div>
      </div>
    </div>
  );
}
