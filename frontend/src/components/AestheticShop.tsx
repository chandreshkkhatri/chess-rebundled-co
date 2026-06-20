"use client";

import { useEffect, useState, useCallback } from "react";

// Shop items definition
export interface ShopItem {
  id: string;
  name: string;
  cost: number;
  description: string;
  type: "skin" | "sound";
}

export const BOARD_SKINS: ShopItem[] = [
  { id: "forest", name: "Classic Forest", cost: 0, description: "Traditional green and cream wood grain look.", type: "skin" },
  { id: "cyberpunk", name: "Cyberpunk Neon", cost: 500, description: "Vibrant neon purple and deep indigo squares.", type: "skin" },
  { id: "gold", name: "Royal Amber", cost: 1000, description: "Elegant gold and rich amber mahogany tones.", type: "skin" },
  { id: "glass", name: "Glassmorphic", cost: 1500, description: "Frosted translucent slate and dark space squares.", type: "skin" },
];

export const SOUND_PACKS: ShopItem[] = [
  { id: "wood", name: "Classic Wood", cost: 0, description: "Organic wooden thud and knock sounds.", type: "sound" },
  { id: "clicky", name: "Mechanical Switch", cost: 400, description: "Crisp clicky mechanical keyboard keystrokes.", type: "sound" },
  { id: "retro", name: "8-Bit Arcade", cost: 800, description: "Retro synth blips, sweeps, and electronic chimes.", type: "sound" },
];

// Color maps for previewing skins
export const SKIN_PREVIEWS: Record<string, { dark: string; light: string }> = {
  forest: { dark: "#769656", light: "#eeeed2" },
  cyberpunk: { dark: "#312e81", light: "#818cf8" },
  gold: { dark: "#78350f", light: "#fef3c7" },
  glass: { dark: "#1e293b", light: "#334155" },
};

interface AestheticShopProps {
  totalXp: number;
}

export function AestheticShop({ totalXp }: AestheticShopProps) {
  const [activeTab, setActiveTab] = useState<"skins" | "sounds">("skins");
  const [unlockedSkins, setUnlockedSkins] = useState<string[]>(["forest"]);
  const [unlockedSounds, setUnlockedSounds] = useState<string[]>(["wood"]);
  const [activeSkin, setActiveSkin] = useState<string>("forest");
  const [activeSound, setActiveSound] = useState<string>("wood");
  const [spentXp, setSpentXp] = useState<number>(0);

  // Load cosmetics state from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedSkins = localStorage.getItem("unlocked_board_skins");
      const storedSounds = localStorage.getItem("unlocked_sound_packs");
      const currentSkin = localStorage.getItem("active_board_skin");
      const currentSound = localStorage.getItem("active_sound_pack");
      const spent = localStorage.getItem("chess_spent_xp");

      if (storedSkins) setUnlockedSkins(JSON.parse(storedSkins));
      if (storedSounds) setUnlockedSounds(JSON.parse(storedSounds));
      if (currentSkin) setActiveSkin(currentSkin);
      if (currentSound) setActiveSound(currentSound);
      if (spent) setSpentXp(parseInt(spent, 10));
    }
  }, []);

  const balance = Math.max(0, totalXp - spentXp);

  // Play synthesized audio previews
  const playSoundPreview = useCallback((packId: string, type: "move" | "capture" = "move") => {
    if (typeof window === "undefined") return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (packId === "clicky") {
        // High click sound with narrow bandpass-like shape
        osc.type = "sine";
        osc.frequency.setValueAtTime(type === "move" ? 1800 : 1200, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
        
        if (type === "capture") {
          // Double click
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = "sine";
          osc2.frequency.setValueAtTime(1000, ctx.currentTime + 0.06);
          gain2.gain.setValueAtTime(0.06, ctx.currentTime + 0.06);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
          osc2.start(ctx.currentTime + 0.06);
          osc2.stop(ctx.currentTime + 0.12);
        }
      } else if (packId === "retro") {
        // Cute 8-bit sounds
        osc.type = "square";
        if (type === "move") {
          osc.frequency.setValueAtTime(440, ctx.currentTime);
          osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.05);
          osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
          gain.gain.setValueAtTime(0.05, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          osc.start();
          osc.stop(ctx.currentTime + 0.2);
        } else {
          // Capture sound (noisy falling pitch)
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.25);
          gain.gain.setValueAtTime(0.06, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
          osc.start();
          osc.stop(ctx.currentTime + 0.25);
        }
      } else {
        // Classic wood
        osc.type = "triangle";
        osc.frequency.setValueAtTime(type === "move" ? 220 : 180, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);

        if (type === "capture") {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(140, ctx.currentTime + 0.07);
          gain2.gain.setValueAtTime(0.1, ctx.currentTime + 0.07);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
          osc2.start(ctx.currentTime + 0.07);
          osc2.stop(ctx.currentTime + 0.2);
        }
      }
    } catch (e) {
      console.warn("Audio Context failed to start:", e);
    }
  }, []);

  const handleUnlock = (item: ShopItem) => {
    if (balance < item.cost) return;

    const newSpent = spentXp + item.cost;
    setSpentXp(newSpent);
    localStorage.setItem("chess_spent_xp", newSpent.toString());

    if (item.type === "skin") {
      const skins = [...unlockedSkins, item.id];
      setUnlockedSkins(skins);
      localStorage.setItem("unlocked_board_skins", JSON.stringify(skins));
      
      // Auto-select newly unlocked skin
      setActiveSkin(item.id);
      localStorage.setItem("active_board_skin", item.id);
      window.dispatchEvent(new Event("active_cosmetics_changed"));
    } else {
      const sounds = [...unlockedSounds, item.id];
      setUnlockedSounds(sounds);
      localStorage.setItem("unlocked_sound_packs", JSON.stringify(sounds));

      // Auto-select newly unlocked sound
      setActiveSound(item.id);
      localStorage.setItem("active_sound_pack", item.id);
      window.dispatchEvent(new Event("active_cosmetics_changed"));
    }
  };

  const handleSelect = (item: ShopItem) => {
    if (item.type === "skin") {
      setActiveSkin(item.id);
      localStorage.setItem("active_board_skin", item.id);
    } else {
      setActiveSound(item.id);
      localStorage.setItem("active_sound_pack", item.id);
    }
    // Trigger custom event to notify open chess boards to re-render
    window.dispatchEvent(new Event("active_cosmetics_changed"));
  };

  return (
    <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700 shadow-xl flex flex-col gap-6">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700/60 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🎨 Cosmetics Shop & Customization
          </h2>
          <p className="text-xs text-slate-400 mt-1">Unlock premium board layouts and synthesized move soundscapes</p>
        </div>
        <div className="bg-purple-900/40 border border-purple-500/30 rounded-xl px-4 py-2 flex items-center gap-3 self-start sm:self-auto">
          <div className="text-right">
            <span className="block text-[9px] font-bold text-purple-300 uppercase tracking-widest">Available Balance</span>
            <span className="text-lg font-black text-white">{balance} XP</span>
          </div>
          <span className="text-2xl">💎</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-700">
        <button
          onClick={() => setActiveTab("skins")}
          className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition-all ${
            activeTab === "skins"
              ? "border-purple-500 text-purple-300 bg-purple-500/5"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          🏁 Chess Board Skins
        </button>
        <button
          onClick={() => setActiveTab("sounds")}
          className={`flex-1 py-3 text-center text-sm font-semibold border-b-2 transition-all ${
            activeTab === "sounds"
              ? "border-purple-500 text-purple-300 bg-purple-500/5"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          🔊 Move Sound Packs
        </button>
      </div>

      {/* Shop Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {(activeTab === "skins" ? BOARD_SKINS : SOUND_PACKS).map((item) => {
          const isUnlocked = activeTab === "skins" 
            ? unlockedSkins.includes(item.id) 
            : unlockedSounds.includes(item.id);
          const isActive = activeTab === "skins" 
            ? activeSkin === item.id 
            : activeSound === item.id;
          const canAfford = balance >= item.cost;
          const colors = activeTab === "skins" ? SKIN_PREVIEWS[item.id] : null;

          return (
            <div
              key={item.id}
              className={`bg-slate-750/50 rounded-xl p-4 border transition-all flex flex-col justify-between gap-4 ${
                isActive 
                  ? "border-purple-500 bg-purple-500/5 shadow-[0_0_15px_rgba(168,85,247,0.15)]" 
                  : "border-slate-700/60 hover:border-slate-600"
              }`}
            >
              <div className="flex gap-4 items-start">
                
                {/* Visual Preview */}
                {activeTab === "skins" && colors ? (
                  <div className="w-14 h-14 rounded overflow-hidden grid grid-cols-2 grid-rows-2 border border-slate-700 flex-shrink-0">
                    <div style={{ backgroundColor: colors.light }} />
                    <div style={{ backgroundColor: colors.dark }} />
                    <div style={{ backgroundColor: colors.dark }} />
                    <div style={{ backgroundColor: colors.light }} />
                  </div>
                ) : (
                  <div className="w-14 h-14 bg-slate-900 border border-slate-800 rounded flex flex-col items-center justify-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => playSoundPreview(item.id, "move")}
                      className="p-1 rounded bg-purple-600/30 text-purple-400 hover:bg-purple-600/50 transition-colors text-[10px] font-bold w-11 text-center"
                      title="Preview Move"
                    >
                      ▶ Move
                    </button>
                    <button
                      onClick={() => playSoundPreview(item.id, "capture")}
                      className="p-1 rounded bg-indigo-600/30 text-indigo-400 hover:bg-indigo-600/50 transition-colors text-[10px] font-bold w-11 text-center"
                      title="Preview Capture"
                    >
                      💥 Capt.
                    </button>
                  </div>
                )}

                {/* Details */}
                <div>
                  <h4 className="font-bold text-white flex items-center gap-1.5 text-sm sm:text-base">
                    {item.name}
                    {isActive && (
                      <span className="text-[10px] bg-purple-600/40 text-purple-300 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                        Active
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.description}</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-700/40">
                <span className="text-xs font-semibold text-slate-400">
                  {item.cost === 0 ? (
                    <span className="text-green-400 font-bold">FREE</span>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-300">
                      💎 {item.cost} XP
                    </span>
                  )}
                </span>
                
                {isUnlocked ? (
                  <button
                    onClick={() => handleSelect(item)}
                    disabled={isActive}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isActive
                        ? "bg-slate-700 text-slate-500 cursor-default"
                        : "bg-purple-600/80 hover:bg-purple-600 text-white hover:shadow-[0_0_10px_rgba(168,85,247,0.3)]"
                    }`}
                  >
                    {isActive ? "Equipped" : "Equip"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleUnlock(item)}
                    disabled={!canAfford}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      canAfford
                        ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white hover:from-purple-400 hover:to-indigo-500 hover:shadow-[0_0_12px_rgba(168,85,247,0.35)]"
                        : "bg-slate-800 text-slate-600 border border-slate-750 cursor-not-allowed"
                    }`}
                    title={!canAfford ? `Need ${item.cost - balance} more XP` : ""}
                  >
                    Unlock
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
