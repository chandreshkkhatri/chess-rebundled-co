"use client";

import { useEffect, useState, useMemo } from "react";

interface Competitor {
  name: string;
  xp: number;
  emoji: string;
  isUser?: boolean;
  badge?: { name: string; emoji: string } | null;
}

interface LeagueLeaderboardProps {
  totalXp: number;
  displayName: string;
}

// Chess-themed competitor usernames
const MOCK_NAMES = [
  "BobbyFischerFan", "QueenGambit99", "VoiceChessPro", "CheckmateWizard",
  "PawnStar", "RookNRoll", "KnightRider", "BishopBash", "DeepBlueJr",
  "KasparovApprentice", "MagnusMini", "HikaruStalker", "BotezGambiteer",
  "SpeedyChess", "TacticalTiger", "EndgameKing", "MatingNet", "SicilianExpert"
];

const EMOJIS = ["👑", "♟️", "🧙‍♂️", "🐯", "⚔️", "🦉", "🚀", "🎩", "🦊"];

const MOCK_BADGES = [
  { name: "Pawn Maestro", emoji: "👑" },
  { name: "Speed Demon", emoji: "⚡" },
  { name: "Tactical Genius", emoji: "🧠" },
  { name: "Caster Fanatic", emoji: "🎙️" },
  { name: "High Spender", emoji: "💎" },
  null,
];

// Division thresholds and metadata
export const DIVISIONS = [
  { id: "pawn", name: "Pawn League", minXp: 0, emoji: "♟️", color: "text-slate-400" },
  { id: "knight", name: "Knight League", minXp: 1000, emoji: "🐴", color: "text-green-400" },
  { id: "bishop", name: "Bishop League", minXp: 2500, emoji: "♗", color: "text-blue-400" },
  { id: "rook", name: "Rook League", minXp: 5000, emoji: "♜", color: "text-indigo-400" },
  { id: "queen", name: "Queen League", minXp: 8000, emoji: "👸", color: "text-pink-400" },
  { id: "king", name: "King League", minXp: 12000, emoji: "👑", color: "text-amber-400" },
];

export function LeagueLeaderboard({ totalXp, displayName }: LeagueLeaderboardProps) {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [leagueEndTime, setLeagueEndTime] = useState<string>("");
  const [timeLeftStr, setTimeLeftStr] = useState<string>("");
  const [equippedBadge, setEquippedBadge] = useState<{ id: string; name: string; emoji: string } | null>(null);

  // Determine current division based on total XP
  const currentDivision = useMemo(() => {
    for (let i = DIVISIONS.length - 1; i >= 0; i--) {
      if (totalXp >= DIVISIONS[i].minXp) {
        return DIVISIONS[i];
      }
    }
    return DIVISIONS[0];
  }, [totalXp]);

  // Load user equipped badge
  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadBadge = () => {
      const activeBadgeStr = localStorage.getItem("active_badge");
      if (activeBadgeStr) {
        try {
          setEquippedBadge(JSON.parse(activeBadgeStr));
        } catch {
          setEquippedBadge({ id: activeBadgeStr, name: activeBadgeStr, emoji: "🎖️" });
        }
      } else {
        setEquippedBadge(null);
      }
    };

    loadBadge();
    window.addEventListener("active_cosmetics_changed", loadBadge);
    return () => window.removeEventListener("active_cosmetics_changed", loadBadge);
  }, []);

  // Load or generate weekly league data
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedEndTime = localStorage.getItem("chess_league_end_time");
    const storedCompetitors = localStorage.getItem("chess_league_competitors");
    const storedDivId = localStorage.getItem("chess_league_division_id");

    let endTime = storedEndTime;
    let list: Competitor[] = [];

    // Reset if league week has ended (or first time)
    const now = new Date();
    if (!endTime || new Date(endTime) <= now || storedDivId !== currentDivision.id) {
      // Set end time to 3 days from now for a fast/engaging cycle
      const end = new Date();
      end.setDate(end.getDate() + 3);
      endTime = end.toISOString();
      localStorage.setItem("chess_league_end_time", endTime);
      localStorage.setItem("chess_league_division_id", currentDivision.id);

      // Generate 9 competitors with XP surrounding the user's XP
      const baseXP = totalXp;
      const generated: Competitor[] = [];
      const shuffledNames = [...MOCK_NAMES].sort(() => 0.5 - Math.random());
      
      for (let i = 0; i < 9; i++) {
        // Distribute XP above and below the user
        const variance = (i - 4) * 80 + (Math.random() - 0.5) * 40;
        const compXp = Math.max(0, Math.round(baseXP + variance));
        const mockBadge = MOCK_BADGES[Math.floor(Math.random() * MOCK_BADGES.length)];
        
        generated.push({
          name: shuffledNames[i],
          xp: compXp,
          emoji: EMOJIS[i % EMOJIS.length],
          badge: mockBadge
        });
      }
      
      list = generated;
      localStorage.setItem("chess_league_competitors", JSON.stringify(list));
    } else {
      list = JSON.parse(storedCompetitors || "[]");
    }

    setLeagueEndTime(endTime);
    setCompetitors(list);
  }, [totalXp, currentDivision]);

  // Active competitor simulator: when user's XP updates, competitors also gain a little XP
  useEffect(() => {
    if (competitors.length === 0) return;

    const storedLastXp = localStorage.getItem("chess_league_user_last_xp");
    const lastXp = storedLastXp ? parseInt(storedLastXp, 10) : 0;

    if (totalXp > lastXp) {
      // User gained XP! Let's update user's last known XP
      localStorage.setItem("chess_league_user_last_xp", totalXp.toString());

      // Randomly update 2-4 competitors to simulate active play
      const updated = competitors.map((comp) => {
        if (Math.random() > 0.6) {
          const gain = Math.round(Math.random() * 30 + 10); // +10 to +40 XP
          return { ...comp, xp: comp.xp + gain };
        }
        return comp;
      });

      setCompetitors(updated);
      localStorage.setItem("chess_league_competitors", JSON.stringify(updated));
    }
  }, [totalXp, competitors]);

  // Format countdown timer
  useEffect(() => {
    if (!leagueEndTime) return;

    const updateTimer = () => {
      const diff = new Date(leagueEndTime).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeftStr("League ended!");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        setTimeLeftStr(`${days}d ${hours}h remaining`);
      } else {
        setTimeLeftStr(`${hours}h ${mins}m remaining`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [leagueEndTime]);

  // Combine user and mock competitors and sort by XP descending
  const sortedLeaderboard = useMemo(() => {
    const userRow: Competitor = {
      name: displayName || "You",
      xp: totalXp,
      emoji: "👑",
      isUser: true
    };
    
    return [...competitors, userRow].sort((a, b) => b.xp - a.xp);
  }, [competitors, totalXp, displayName]);

  // Find user's position
  const userRank = sortedLeaderboard.findIndex((c) => c.isUser) + 1;

  // Next Division calculation
  const nextDivision = useMemo(() => {
    const idx = DIVISIONS.findIndex((d) => d.id === currentDivision.id);
    if (idx !== -1 && idx < DIVISIONS.length - 1) {
      return DIVISIONS[idx + 1];
    }
    return null;
  }, [currentDivision]);

  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl flex flex-col gap-5">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl" role="img" aria-label="trophy">🏆</span>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Weekly League
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Compete with active chess players in your division</p>
          </div>
        </div>
        
        {/* Countdown */}
        <div className="text-right self-start sm:self-auto">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Time Left</span>
          <span className="text-xs font-mono font-bold text-purple-400 bg-purple-950/40 border border-purple-500/20 px-2.5 py-1 rounded-lg">
            ⏱️ {timeLeftStr || "Calculating..."}
          </span>
        </div>
      </div>

      {/* Current Division Info Badge */}
      <div className="bg-slate-900/55 rounded-xl p-4 border border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-900/35 border border-purple-500/20 flex items-center justify-center text-3xl select-none">
            {currentDivision.emoji}
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-purple-400">Current Tier</span>
            <h3 className="text-base font-black text-white">{currentDivision.name}</h3>
          </div>
        </div>

        {/* Promotion goal info */}
        <div className="text-right">
          {nextDivision ? (
            <>
              <span className="text-[9px] uppercase font-semibold text-slate-500 block">Next Division</span>
              <span className="text-xs text-slate-300 font-bold flex items-center gap-1 justify-end">
                {nextDivision.emoji} {nextDivision.name}
              </span>
              <span className="text-[10px] text-slate-400">
                (Need {Math.max(0, nextDivision.minXp - totalXp)} more XP)
              </span>
            </>
          ) : (
            <span className="text-xs text-yellow-400 font-black">👑 ULTIMATE KING CHAMPION</span>
          )}
        </div>
      </div>

      {/* Leaderboard list */}
      <div className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
        {sortedLeaderboard.map((item, idx) => {
          const rank = idx + 1;
          
          // Zone determinations
          let zoneClass = "border-slate-800/40";
          let zoneIndicator = null;
          if (rank <= 3) {
            // Promotion Zone
            zoneClass = "border-green-500/20 bg-green-500/5";
            zoneIndicator = (
              <span className="text-[9px] font-extrabold text-green-400 flex items-center gap-0.5 bg-green-950/50 px-1.5 py-0.5 rounded border border-green-500/20" title="Promotes to next league">
                ▲ PROMOTION
              </span>
            );
          } else if (rank >= 8) {
            // Demotion Zone
            zoneClass = "border-red-500/20 bg-red-500/5";
            zoneIndicator = (
              <span className="text-[9px] font-extrabold text-red-400 flex items-center gap-0.5 bg-red-950/50 px-1.5 py-0.5 rounded border border-red-500/20" title="Demotes to previous league">
                ▼ DEMOTION
              </span>
            );
          }

          // User highlight styling
          const isUser = item.isUser;

          return (
            <div
              key={item.name}
              className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                isUser
                  ? "border-purple-500 bg-purple-500/10 shadow-[0_0_12px_rgba(168,85,247,0.15)] ring-1 ring-purple-500/30"
                  : zoneClass
              }`}
            >
              {/* Rank, Emoji and Name */}
              <div className="flex items-center gap-3">
                
                {/* Rank number / medal */}
                <div className="w-6 text-center font-mono font-bold">
                  {rank === 1 ? (
                    <span className="text-yellow-400 text-lg">🥇</span>
                  ) : rank === 2 ? (
                    <span className="text-slate-300 text-lg">🥈</span>
                  ) : rank === 3 ? (
                    <span className="text-amber-600 text-lg">🥉</span>
                  ) : (
                    <span className={rank >= 8 ? "text-red-400/80" : "text-slate-400"}>{rank}</span>
                  )}
                </div>

                {/* Avatar Emoji */}
                <span className="text-lg w-6 text-center select-none">{item.emoji}</span>

                {/* Username */}
                <span className={`text-xs sm:text-sm font-semibold truncate max-w-[120px] sm:max-w-[200px] flex items-center gap-1.5 ${
                  isUser ? "text-purple-300 font-extrabold" : "text-slate-200"
                }`}>
                  {isUser ? (
                    equippedBadge && (
                      <span className="bg-purple-900/60 text-purple-300 text-[10px] font-black px-1.5 py-0.5 rounded border border-purple-500/20 flex items-center gap-1 flex-shrink-0" title={equippedBadge.name}>
                        <span>{equippedBadge.emoji}</span>
                      </span>
                    )
                  ) : (
                    item.badge && (
                      <span className="bg-slate-900/60 text-slate-400 text-[10px] font-bold px-1.5 py-0.5 rounded border border-slate-700/50 flex items-center gap-1 flex-shrink-0" title={item.badge.name}>
                        <span>{item.badge.emoji}</span>
                      </span>
                    )
                  )}
                  <span>{item.name}</span> {isUser && <span className="text-[10px] font-bold text-purple-400">(You)</span>}
                </span>
              </div>

              {/* Status Badge and XP Score */}
              <div className="flex items-center gap-3">
                {zoneIndicator}
                <span className="text-xs font-bold text-slate-300 font-mono">
                  {item.xp.toLocaleString()} <span className="text-[10px] text-slate-500 font-semibold font-sans">XP</span>
                </span>
              </div>

            </div>
          );
        })}
      </div>

      {/* Promotion Guide */}
      <div className="bg-slate-900/30 rounded-xl p-3 border border-slate-800/40 text-[10px] text-slate-400 flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="font-bold text-slate-300 uppercase tracking-wide">Promotion Rule</span>
        </div>
        <p className="leading-relaxed">
          Be in the **top 3 Promotion Zone** when the weekly timer ends to advance to the next division! Finishing in the **bottom 3 Demotion Zone** will demote you to the lower division.
        </p>
      </div>

    </div>
  );
}
