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

const CHAT_COLORS = [
  "text-red-400", "text-blue-400", "text-green-400", "text-yellow-400",
  "text-pink-400", "text-purple-400", "text-orange-400", "text-teal-400"
];

const MOCK_CHATTERS = [
  "ChessStar", "BlunderGod", "PawnHustler", "ForkMaster", "SackTheQueen",
  "RookRider", "StockfishLevel9", "MagnusJunior", "TwitchChatGM", "SubGiga",
  "KnightRider", "SicilianPro", "KingCastle", "DeepBlue9", "HikaruMod", "LevySub"
];

const CHAT_TEMPLATES: Record<string, Record<string, string[]>> = {
  hikaru: {
    opening: [
      "literally playing standard book moves LUL",
      "speedrun hype! 🚀",
      "What is this opening called?",
      "takes takes takes takes",
      "hikaru stream is vibes tonight",
      "poggers opening",
      "Is this the king's gambit?",
      "juiced opening"
    ],
    capture: [
      "EZ CLAP",
      "Takes takes takes LUL",
      "clean capture Pog",
      "material advantage acquired",
      "POGGERS",
      "that bishop was juicy",
      "no way they let him take that",
      "GG piece"
    ],
    check: [
      "monkaS check",
      "Uh oh, check!",
      "widepeepoHappy block it!",
      "EZ defense incoming",
      "King under pressure!",
      "Not worried, it's Hikaru",
      "checkmate next? Kappa",
      "block with bishop!"
    ],
    checkmate: [
      "GG SPEEDRUN! 🏆",
      "literally checkmate LUL",
      "EASY GAME GGs",
      "GG WP",
      "Hikaru is too good",
      "100% accuracy incoming",
      "GIGACHAD HIKARU",
      "absolute destruction"
    ],
    castling: [
      "King safety Pog",
      "Castled! 🏰",
      "Standard castle",
      "rooks connected!"
    ],
    promotion: [
      "QUEEN PROMOTION Pog",
      "another queen LUL",
      "GG, promotion is too much",
      "devastating queen"
    ],
    quiet: [
      "what was that move? 🤔",
      "looks winning",
      "consolidating the position",
      "literally doing nothing Kappa",
      "boring move yawn",
      "Hikaru logic is 200 IQ",
      "Pog",
      "LUL"
    ]
  },
  gotham: {
    opening: [
      "THE JEWELS! e4",
      "danger levels guys!!",
      "Levy e4 content is best content",
      "classic theory",
      "1600 rated opening",
      "pog opening",
      "here we go!"
    ],
    capture: [
      "HE SACRIFICED THE ROOOOOOK!!!",
      "THE ROOOOOOK!!!",
      "OMG HE TOOK IT",
      "Levy shouting imminent LUL",
      "PogChamp capture!",
      "clean tactics",
      "danger levels high"
    ],
    check: [
      "CHECK! monkaS",
      "where is the king going?!",
      "Levy screaming incoming",
      "direct check! 💥",
      "Oh no, the king is naked!",
      "tactical check"
    ],
    checkmate: [
      "CHECKMATE! THE ROOOOOOK! 💥",
      "HE ACTUALLY MATED HIM",
      "GG! Brilliant game!",
      "Levy deserves a sub for this",
      "GG WP",
      "What a finish!",
      "masterpiece!"
    ],
    castling: [
      "Castled! King safe",
      "sensible move Levy",
      "🏰 safety first",
      "rooks ready to roll"
    ],
    promotion: [
      "PROMOTION! 👑",
      "Queen incoming!",
      "Devastating push",
      "GG, queen is active"
    ],
    quiet: [
      "is that a blunder? monkaS",
      "preparing the trap!",
      "danger levels is 100",
      "guessing the move: e4",
      "LUL did he hang a pawn?",
      "solid positional stuff"
    ]
  },
  botez: {
    opening: [
      "Andrea stream is lit tonight 🔥",
      "poggers opening",
      "Botez Gambit when? LUL",
      "Andrea concentrate!",
      "chat is fast today",
      "hello from Europe!"
    ],
    capture: [
      "OMG capture!",
      "Botez Gambit incoming?? LUL",
      "Wait, she captured! Pog",
      "Andrea is cracked today",
      "EZ captures",
      "rip that knight"
    ],
    check: [
      "RUN ANDREA RUN",
      "check monkaS",
      "Panic in chat LUL",
      "is she safe??",
      "bishop block!"
    ],
    checkmate: [
      "WE WON! Pog",
      "BOTEZ STREAM WINS!",
      "GG GGs",
      "Andrea carried by chat LUL",
      "clean checkmate!"
    ],
    castling: [
      "Castled! 🏰",
      "Finally king safety",
      "Andrea remembered castle LUL"
    ],
    promotion: [
      "QUEEN PROMOTION!!!",
      "pog queen",
      "GG game over"
    ],
    quiet: [
      "blunder? Kappa",
      "Andrea is playing so sneaky",
      "chat says d4 was better",
      "LUL what is this move",
      "looks solid",
      "Andrea big brain"
    ]
  },
  magnus: {
    opening: [
      "goat e4",
      "Magnus is chill",
      "standard Magnus game",
      "EZ win for Magnus",
      "Magnus sleeping and winning LUL",
      "solid opening"
    ],
    capture: [
      "clean exchange",
      "structurally superior",
      "goat calculations",
      "EZ piece trade",
      "Magnus logic too good",
      "GG chess"
    ],
    check: [
      "check, easy block",
      "Magnus doesn't care LUL",
      "neutralized instantly",
      "king moves"
    ],
    checkmate: [
      "goat checkmate 🐐",
      "GG WP",
      "endgame masterclass",
      "unbelievable technique",
      "Magnus Carlsen is the GOAT"
    ],
    castling: [
      "🏰 castle",
      "sensible positional play",
      "rooks ready"
    ],
    promotion: [
      "queen promotion",
      "straightforward win",
      "endgame decided"
    ],
    quiet: [
      "positional squeeze",
      "slowly improving pieces",
      "Magnus GIGACHAD",
      "no counterplay for black",
      "boring but 100% winning",
      "goat moves"
    ]
  }
};

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  badge?: string;
  isUser?: boolean;
  color: string;
}

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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userChatText, setUserChatText] = useState("");
  const prevMoveCountRef = useRef<number>(0);
  const lastCommentsRef = useRef<Record<string, string>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // TTS utility
  const speakComment = useCallback((text: string, casterId: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const caster = CASTERS.find((c) => c.id === casterId) || CASTERS[0];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.pitch = caster.voicePitch;
    utterance.rate = caster.voiceRate;
    
    const voices = window.speechSynthesis.getVoices();
    let preferredVoice = null;
    
    if (casterId === "magnus") {
      preferredVoice = voices.find((v) => v.lang.includes("en-GB") && v.name.toLowerCase().includes("male"));
    } else if (casterId === "gotham") {
      preferredVoice = voices.find((v) => v.lang.includes("en-US") && v.name.toLowerCase().includes("male"));
    } else if (casterId === "botez") {
      preferredVoice = voices.find((v) => v.lang.includes("en-US") && v.name.toLowerCase().includes("female"));
    }
    
    if (!preferredVoice) {
      preferredVoice = voices.find((v) => v.lang.startsWith("en"));
    }

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // Generate chat messages on move
  const triggerChatMessages = useCallback((casterId: string, category: string, lastMove: string) => {
    // Clear pending timeouts
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    const templates = CHAT_TEMPLATES[casterId][category] || CHAT_TEMPLATES[casterId].quiet;
    const shuffledChatters = [...MOCK_CHATTERS].sort(() => 0.5 - Math.random());
    const count = Math.floor(Math.random() * 2) + 3; // 3 to 4 messages

    const badges = ["🛡️", "💎", "⭐", undefined];

    for (let i = 0; i < count; i++) {
      const delay = Math.random() * 800 + i * 350 + 100;
      const t = setTimeout(() => {
        const chatter = shuffledChatters[i % shuffledChatters.length];
        const template = templates[Math.floor(Math.random() * templates.length)];
        const text = template.replace(/e4/g, lastMove);
        const color = CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)];
        const badge = badges[Math.floor(Math.random() * badges.length)];

        const newMessage: ChatMessage = {
          id: Math.random().toString(),
          username: chatter,
          text,
          badge,
          color
        };

        setChatMessages((prev) => [...prev, newMessage].slice(-25));
      }, delay);
      timeoutsRef.current.push(t);
    }
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
      
      // Initialize welcome chat messages
      setChatMessages([
        { id: "welcome-1", username: "TwitchChatGM", text: "Pog! Stream is online!", badge: "⭐", color: "text-green-400" },
        { id: "welcome-2", username: "PawnPusher", text: "let's gooooo! 🙌", badge: "🛡️", color: "text-blue-400" },
        { id: "welcome-3", username: "SackTheQueen", text: "Predicting a massive blunder today Kappa", color: "text-yellow-400" }
      ]);
      return;
    }

    const lastMove = moves[moves.length - 1];
    const moveIndex = moves.length;

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
    let comment = templates[Math.floor(Math.random() * templates.length)];
    comment = comment.replace(/e4/g, lastMove);

    setCommentaryText(comment);
    lastCommentsRef.current[casterId] = comment;

    if (ttsEnabled) {
      speakComment(comment, casterId);
    }

    // Trigger chat reaction
    triggerChatMessages(casterId, category, lastMove);

  }, [moves, ttsEnabled, speakComment, triggerChatMessages]);

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
    
    // Clear chat on caster change to fresh Twitch channel vibes
    setChatMessages([
      { id: "switch-1", username: "System", text: `Switched to ${casterId}'s stream chat...`, color: "text-slate-500" }
    ]);

    if (moves.length === 0) {
      updateCommentary(casterId);
    } else {
      const cached = lastCommentsRef.current[casterId];
      if (cached) {
        setCommentaryText(cached);
        if (ttsEnabled) speakComment(cached, casterId);
        
        // Trigger small batch of chat messages
        triggerChatMessages(casterId, "quiet", moves[moves.length - 1]);
      } else {
        updateCommentary(casterId);
      }
    }
  };

  // Trigger TTS voice load
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  const handleSendUserChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userChatText.trim()) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      username: "You",
      text: userChatText.trim(),
      badge: "👑",
      isUser: true,
      color: "text-purple-400"
    };

    setChatMessages((prev) => [...prev, userMsg].slice(-25));
    setUserChatText("");

    // Stagger a funny reply from a mock chatter
    const replyTimeout = setTimeout(() => {
      const fanNames = ["ChessFan123", "TwitchChatGM", "KnightHype", "PawnStar99", "StockfishEnthusiast"];
      const fanReplies = [
        "True! @You is speaking facts.",
        "Kappa, I think you're right.",
        "Exactly! Let's goooo! 🚀",
        "LUL @You is 100% correct.",
        "Pog, nice analysis!",
      ];

      const replyMsg: ChatMessage = {
        id: Math.random().toString(),
        username: fanNames[Math.floor(Math.random() * fanNames.length)],
        text: fanReplies[Math.floor(Math.random() * fanReplies.length)],
        badge: Math.random() > 0.5 ? "⭐" : undefined,
        color: CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)]
      };
      setChatMessages((prev) => [...prev, replyMsg].slice(-25));
    }, 850);
    
    timeoutsRef.current.push(replyTimeout);
  };

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

      {/* Simulated Live Stream Chat Panel */}
      <div className="flex flex-col gap-2 border-t border-slate-700/40 pt-3">
        <h4 className="text-[9px] font-extrabold text-slate-500 uppercase tracking-widest flex items-center gap-1">
          <span>💬</span> Live Stream Chat
        </h4>

        {/* Chat Log View */}
        <div className="h-36 bg-slate-900/80 rounded-xl p-2.5 border border-slate-850/80 overflow-y-auto flex flex-col gap-1.5 custom-scrollbar font-mono text-[10px]">
          {chatMessages.length === 0 ? (
            <div className="text-slate-500 italic text-center my-auto">Chat is quiet...</div>
          ) : (
            chatMessages.map((msg) => (
              <div key={msg.id} className="flex items-start gap-1 leading-normal break-all">
                {msg.badge && (
                  <span className="text-[9px] flex-shrink-0 mr-0.5 select-none" title={msg.badge}>
                    {msg.badge}
                  </span>
                )}
                <span className={`font-bold mr-1 flex-shrink-0 ${msg.color}`}>
                  {msg.username}:
                </span>
                <span className={msg.isUser ? "text-purple-300 font-medium" : "text-slate-300"}>
                  {msg.text}
                </span>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        {/* User Chat Input Box */}
        <form onSubmit={handleSendUserChat} className="flex gap-2">
          <input
            type="text"
            value={userChatText}
            onChange={(e) => setUserChatText(e.target.value)}
            placeholder="Send a chat message..."
            className="flex-1 bg-slate-900 border border-slate-700/60 rounded-lg px-3 py-1.5 text-[10px] text-slate-200 outline-none focus:ring-1 focus:ring-purple-500 focus:border-transparent font-sans"
          />
          <button
            type="submit"
            className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all hover:shadow-[0_0_8px_rgba(168,85,247,0.25)] flex items-center justify-center"
          >
            Chat
          </button>
        </form>
      </div>

    </div>
  );
}
