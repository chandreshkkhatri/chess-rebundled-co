import { create } from 'zustand';
import { Player, HistoricalGame, MoveResult, GameStatus } from '@/types';

interface GameState {
  // Connection
  isConnected: boolean;

  // Room
  roomId: string | null;
  players: Player[];
  myPlayerId: string | null;
  myColor: 'white' | 'black' | null;

  // Game selection
  availableGames: HistoricalGame[];
  selectedGame: HistoricalGame | null;

  // Game state
  status: GameStatus;
  currentPosition: string;
  currentTurn: 'white' | 'black';
  moveIndex: number;
  timeRemaining: number;
  timeLimit: number;

  // Results
  lastMoveResult: MoveResult | null;
  trivia: string[];
  winnerId: string | null;

  // Voice
  isListening: boolean;
  transcript: string;
  voiceConfidence: number;

  // Actions
  setConnected: (connected: boolean) => void;
  setRoom: (roomId: string, players: Player[], availableGames: HistoricalGame[]) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  setMyPlayer: (playerId: string, color: 'white' | 'black') => void;
  setSelectedGame: (game: HistoricalGame) => void;
  startGame: (position: string, turn: 'white' | 'black', timeLimit: number, players: Player[]) => void;
  updateTimer: (remaining: number) => void;
  setMoveResult: (result: MoveResult) => void;
  changeTurn: (turn: 'white' | 'black', position: string, moveIndex: number) => void;
  endGame: (winnerId: string | null, players: Player[], trivia: string[]) => void;
  setVoiceState: (isListening: boolean, transcript: string, confidence: number) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  roomId: null,
  players: [],
  myPlayerId: null,
  myColor: null,
  availableGames: [],
  selectedGame: null,
  status: 'idle' as GameStatus,
  currentPosition: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  currentTurn: 'white' as const,
  moveIndex: 0,
  timeRemaining: 10000,
  timeLimit: 10000,
  lastMoveResult: null,
  trivia: [],
  winnerId: null,
  isListening: false,
  transcript: '',
  voiceConfidence: 0,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setConnected: (connected) => set({ isConnected: connected }),

  setRoom: (roomId, players, availableGames) => {
    const myPlayer = players.find((p) => p.socketId === get().myPlayerId);
    set({
      roomId,
      players,
      availableGames,
      status: players.length < 2 ? 'waiting' : 'selecting',
      myColor: myPlayer?.color || null,
    });
  },

  addPlayer: (player) =>
    set((state) => {
      const players = [...state.players, player];
      return {
        players,
        status: players.length >= 2 ? 'selecting' : 'waiting',
      };
    }),

  removePlayer: (playerId) =>
    set((state) => ({
      players: state.players.filter((p) => p.id !== playerId),
      status: 'waiting',
    })),

  setMyPlayer: (playerId, color) => set({ myPlayerId: playerId, myColor: color }),

  setSelectedGame: (game) => set({ selectedGame: game }),

  startGame: (position, turn, timeLimit, players) =>
    set({
      status: 'playing',
      currentPosition: position,
      currentTurn: turn,
      timeLimit,
      timeRemaining: timeLimit,
      moveIndex: 0,
      players,
      lastMoveResult: null,
    }),

  updateTimer: (remaining) => set({ timeRemaining: remaining }),

  setMoveResult: (result) =>
    set((state) => ({
      lastMoveResult: result,
      players: state.players.map((p) =>
        p.id === result.playerId
          ? { ...p, score: p.score + result.score, moveScores: [...p.moveScores, result.score] }
          : p
      ),
    })),

  changeTurn: (turn, position, moveIndex) =>
    set((state) => ({
      currentTurn: turn,
      currentPosition: position,
      moveIndex,
      timeRemaining: state.timeLimit,
      lastMoveResult: null,
    })),

  endGame: (winnerId, players, trivia) =>
    set({
      status: 'finished',
      winnerId,
      players,
      trivia,
    }),

  setVoiceState: (isListening, transcript, confidence) =>
    set({ isListening, transcript, voiceConfidence: confidence }),

  reset: () => set(initialState),
}));
