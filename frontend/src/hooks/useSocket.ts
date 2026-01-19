'use client';

import { useEffect, useCallback } from 'react';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/gameStore';
import { Player, HistoricalGame, MoveResult, Challenge, ChallengeAcceptedData } from '@/types';

export function useSocket() {
  const {
    setConnected,
    setChallenges,
    addChallenge,
    removeChallenge,
    setMyChallenge,
    handleMatchFound,
    setRoom,
    addPlayer,
    removePlayer,
    setMyPlayer,
    setSelectedGame,
    startGame,
    updateTimer,
    setMoveResult,
    changeTurn,
    endGame,
  } = useGameStore();

  useEffect(() => {
    const socket = getSocket();

    socket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    socket.on('room-joined', (data: { roomId: string; players: Player[]; availableGames: HistoricalGame[] }) => {
      console.log('Room joined:', data);
      setRoom(data.roomId, data.players, data.availableGames);
      // Set our player info based on the last player in the list (us)
      const myPlayer = data.players[data.players.length - 1];
      if (myPlayer) {
        setMyPlayer(myPlayer.id, myPlayer.color);
      }
    });

    socket.on('player-joined', (player: Player) => {
      console.log('Player joined:', player);
      addPlayer(player);
    });

    socket.on('player-left', (playerId: string) => {
      console.log('Player left:', playerId);
      removePlayer(playerId);
    });

    socket.on('game-selected', (game: HistoricalGame) => {
      console.log('Game selected:', game.title);
      setSelectedGame(game);
    });

    socket.on('game-start', (data: { position: string; turn: 'white' | 'black'; timeLimit: number; players: Player[] }) => {
      console.log('Game started:', data);
      startGame(data.position, data.turn, data.timeLimit, data.players);
    });

    socket.on('timer-sync', (data: { remaining: number }) => {
      updateTimer(data.remaining);
    });

    socket.on('move-result', (result: MoveResult) => {
      console.log('Move result:', result);
      setMoveResult(result);
    });

    socket.on('turn-change', (data: { turn: 'white' | 'black'; position: string; moveIndex: number }) => {
      console.log('Turn change:', data);
      changeTurn(data.turn, data.position, data.moveIndex);
    });

    socket.on('game-end', (data: { winner: string | null; players: Player[]; trivia: string[] }) => {
      console.log('Game ended:', data);
      endGame(data.winner, data.players, data.trivia);
    });

    socket.on('error', (data: { message: string }) => {
      console.error('Socket error:', data.message);
    });

    // Lobby events
    socket.on('challenges-list', (challenges: Challenge[]) => {
      console.log('Challenges received:', challenges.length);
      setChallenges(challenges);
    });

    socket.on('challenge-created', (challenge: Challenge) => {
      console.log('New challenge:', challenge);
      // Check if this is our challenge
      if (challenge.creatorSocketId === socket.id) {
        setMyChallenge(challenge);
      }
      addChallenge(challenge);
    });

    socket.on('challenge-removed', (challengeId: string) => {
      console.log('Challenge removed:', challengeId);
      removeChallenge(challengeId);
    });

    socket.on('challenge-accepted', (data: ChallengeAcceptedData) => {
      console.log('Challenge accepted, game starting:', data);
      handleMatchFound(data, socket.id || '');
    });

    connectSocket();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room-joined');
      socket.off('player-joined');
      socket.off('player-left');
      socket.off('game-selected');
      socket.off('game-start');
      socket.off('timer-sync');
      socket.off('move-result');
      socket.off('turn-change');
      socket.off('game-end');
      socket.off('error');
      socket.off('challenges-list');
      socket.off('challenge-created');
      socket.off('challenge-removed');
      socket.off('challenge-accepted');
      disconnectSocket();
    };
  }, []);

  const joinRoom = useCallback((roomId: string, playerName: string) => {
    const socket = getSocket();
    socket.emit('join-room', { roomId, playerName });
  }, []);

  const selectGame = useCallback((roomId: string, gameId: string) => {
    const socket = getSocket();
    socket.emit('select-game', { roomId, gameId });
  }, []);

  const startGameAction = useCallback((roomId: string) => {
    const socket = getSocket();
    socket.emit('start-game', { roomId });
  }, []);

  const submitMove = useCallback((roomId: string, move: string, confidence: number) => {
    const socket = getSocket();
    socket.emit('submit-move', { roomId, move, confidence });
  }, []);

  // Lobby actions
  const createChallenge = useCallback((playerName: string) => {
    const socket = getSocket();
    socket.emit('create-challenge', { playerName });
  }, []);

  const cancelChallenge = useCallback(() => {
    const socket = getSocket();
    socket.emit('cancel-challenge');
    setMyChallenge(null);
  }, [setMyChallenge]);

  const getChallenges = useCallback(() => {
    const socket = getSocket();
    socket.emit('get-challenges');
  }, []);

  const acceptChallenge = useCallback((challengeId: string, playerName: string) => {
    const socket = getSocket();
    socket.emit('accept-challenge', { challengeId, playerName });
  }, []);

  return {
    joinRoom,
    selectGame,
    startGame: startGameAction,
    submitMove,
    createChallenge,
    cancelChallenge,
    getChallenges,
    acceptChallenge,
  };
}
