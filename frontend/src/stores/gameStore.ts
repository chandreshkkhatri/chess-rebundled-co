import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Player, HistoricalGame, MoveResult, GameStatus, Challenge, ChallengeAcceptedData, MoveDetails, RejoinData } from '@/types';

interface GameState {
  // Connection
  isConnected: boolean;

  // Lobby
  challenges: Challenge[];
  myChallenge: Challenge | null;
  playerName: string;

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
  whiteTime: number;
  blackTime: number;
  timeLimit: number;

  // Results
  lastMoveResult: MoveResult | null;
  trivia: string[];
  winnerId: string | null;

  // Current move to identify (displayed on board)
  currentExpectedMove: MoveDetails | null;

  // Ready/Countdown
  readyPlayers: string[];
  countdownValue: number | null;

  // Voice
  isListening: boolean;
  transcript: string;
  voiceConfidence: number;

  // Submission lock - prevents double-submit race conditions
  isSubmitting: boolean;

  // Actions
  setConnected: (connected: boolean) => void;
  setPlayerName: (name: string) => void;
  setChallenges: (challenges: Challenge[]) => void;
  addChallenge: (challenge: Challenge) => void;
  removeChallenge: (challengeId: string) => void;
  setMyChallenge: (challenge: Challenge | null) => void;
  handleMatchFound: (data: ChallengeAcceptedData, mySocketId: string) => void;
  setRoom: (roomId: string, players: Player[], availableGames: HistoricalGame[]) => void;
  addPlayer: (player: Player) => void;
  removePlayer: (playerId: string) => void;
  setMyPlayer: (playerId: string, color: 'white' | 'black') => void;
  setSelectedGame: (game: HistoricalGame) => void;
  startGame: (position: string, turn: 'white' | 'black', timeLimit: number, whiteTime: number, blackTime: number, players: Player[], expectedMove: MoveDetails | null) => void;
  updateTimers: (whiteTime: number, blackTime: number) => void;
  reconcileState: (turn: 'white' | 'black', position: string, moveIndex: number, whiteTime: number, blackTime: number, players: Player[]) => void;
  setMoveResult: (result: MoveResult) => void;
  changeTurn: (turn: 'white' | 'black', position: string, moveIndex: number, whiteTime: number, blackTime: number, expectedMove: MoveDetails | null) => void;
  endGame: (winnerId: string | null, players: Player[], trivia: string[]) => void;
  setVoiceState: (isListening: boolean, transcript: string, confidence: number) => void;
  handleRejoin: (data: RejoinData) => void;
  markPlayerReady: (playerId: string) => void;
  startCountdown: (seconds: number) => void;
  countdownTick: (seconds: number) => void;
  setSubmitting: (isSubmitting: boolean) => void;
  reset: () => void;
}

const initialState = {
  isConnected: false,
  challenges: [] as Challenge[],
  myChallenge: null as Challenge | null,
  playerName: '',
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
  whiteTime: 180000,
  blackTime: 180000,
  timeLimit: 180000,
  lastMoveResult: null,
  trivia: [],
  winnerId: null,
  currentExpectedMove: null,
  readyPlayers: [] as string[],
  countdownValue: null as number | null,
  isListening: false,
  transcript: '',
  voiceConfidence: 0,
  isSubmitting: false,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setConnected: (connected) => set({ isConnected: connected }),

  setPlayerName: (name) => set({ playerName: name }),

  setChallenges: (challenges) => set({ challenges }),

  addChallenge: (challenge) =>
    set((state) => ({
      challenges: [challenge, ...state.challenges],
    })),

  removeChallenge: (challengeId) =>
    set((state) => ({
      challenges: state.challenges.filter((c) => c.id !== challengeId),
      myChallenge: state.myChallenge?.id === challengeId ? null : state.myChallenge,
    })),

  setMyChallenge: (challenge) =>
    set({
      myChallenge: challenge,
      status: challenge ? 'waiting-for-match' : 'in-lobby',
    }),

  handleMatchFound: (data, mySocketId) => {
    console.log('handleMatchFound called:');
    console.log('  data.roomId:', data.roomId);
    console.log('  mySocketId:', mySocketId);
    console.log('  players:', data.players.map(p => `${p.name}(${p.socketId})`).join(', '));
    const myPlayer = data.players.find((p) => p.socketId === mySocketId);
    console.log('  myPlayer:', myPlayer ? `${myPlayer.name}(${myPlayer.id})` : 'NOT FOUND');
    set({
      roomId: data.roomId,
      selectedGame: data.game,
      players: data.players,
      currentPosition: data.position,
      timeLimit: data.timeLimit,
      status: 'ready',
      myPlayerId: myPlayer?.id || null,
      myColor: myPlayer?.color || null,
      myChallenge: null,
      challenges: [],
      moveIndex: 0,
      lastMoveResult: null,
      readyPlayers: [],
      countdownValue: null,
    });
  },

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

  startGame: (position, turn, timeLimit, whiteTime, blackTime, players, expectedMove) =>
    set({
      status: 'playing',
      currentPosition: position,
      currentTurn: turn,
      timeLimit,
      whiteTime,
      blackTime,
      moveIndex: 0,
      players,
      lastMoveResult: null,
      currentExpectedMove: expectedMove,
    }),

  updateTimers: (whiteTime, blackTime) => set({ whiteTime, blackTime }),

  reconcileState: (turn, position, moveIndex, whiteTime, blackTime, players) => {
    const state = get();
    // Only reconcile if we're in playing state and there's a mismatch
    if (state.status !== 'playing') return;

    const hasStateChange =
      state.currentTurn !== turn ||
      state.currentPosition !== position ||
      state.moveIndex !== moveIndex;

    if (hasStateChange) {
      console.log('[RECONCILE] State mismatch detected, syncing from server:', {
        localTurn: state.currentTurn, serverTurn: turn,
        localMoveIndex: state.moveIndex, serverMoveIndex: moveIndex,
      });
      set({
        currentTurn: turn,
        currentPosition: position,
        moveIndex,
        whiteTime,
        blackTime,
        players,
        // Clear lastMoveResult since turn changed
        lastMoveResult: null,
        isSubmitting: false,  // Clear submission lock on state reconciliation
      });
    } else {
      // Just update timers if no state change
      set({ whiteTime, blackTime, players });
    }
  },

  setMoveResult: (result) =>
    set((state) => ({
      lastMoveResult: result,
      players: state.players.map((p) =>
        p.id === result.playerId
          ? { ...p, score: p.score + result.score, moveScores: [...p.moveScores, result.score] }
          : p
      ),
    })),

  changeTurn: (turn, position, moveIndex, whiteTime, blackTime, expectedMove) =>
    set({
      currentTurn: turn,
      currentPosition: position,
      moveIndex,
      whiteTime,
      blackTime,
      lastMoveResult: null,
      currentExpectedMove: expectedMove,
      isSubmitting: false,  // Clear submission lock on turn change
    }),

  endGame: (winnerId, players, trivia) =>
    set({
      status: 'finished',
      winnerId,
      players,
      trivia,
      currentExpectedMove: null,
    }),

  setVoiceState: (isListening, transcript, confidence) =>
    set({ isListening, transcript, voiceConfidence: confidence }),

  handleRejoin: (data) =>
    set({
      roomId: data.roomId,
      players: data.players,
      selectedGame: data.selectedGame,
      status: data.status,
      currentPosition: data.currentPosition,
      currentTurn: data.currentTurn,
      moveIndex: data.moveIndex,
      whiteTime: data.whiteTime,
      blackTime: data.blackTime,
      timeLimit: data.timeLimit,
      currentExpectedMove: data.expectedMove,
      myPlayerId: data.myPlayerId,
      myColor: data.myColor,
      readyPlayers: data.readyPlayers,
      challenges: [],
      myChallenge: null,
    }),

  markPlayerReady: (playerId) =>
    set((state) => ({
      readyPlayers: [...state.readyPlayers, playerId],
    })),

  startCountdown: (seconds) =>
    set({
      status: 'countdown',
      countdownValue: seconds,
    }),

  countdownTick: (seconds) =>
    set({
      countdownValue: seconds,
    }),

  setSubmitting: (isSubmitting) => set({ isSubmitting }),

      reset: () => set(initialState),
    }),
    {
      name: 'chess-game-storage',
      storage: {
        getItem: (name) => {
          if (typeof window === 'undefined') return null;
          const str = sessionStorage.getItem(name);
          return str ? JSON.parse(str) : null;
        },
        setItem: (name, value) => {
          if (typeof window === 'undefined') return;
          sessionStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          if (typeof window === 'undefined') return;
          sessionStorage.removeItem(name);
        },
      },
      partialize: (state) => ({
        // Only persist essential game state for rejoin
        roomId: state.roomId,
        myPlayerId: state.myPlayerId,
        myColor: state.myColor,
        playerName: state.playerName,
        status: state.status,
      }) as GameState,
    }
  )
);
