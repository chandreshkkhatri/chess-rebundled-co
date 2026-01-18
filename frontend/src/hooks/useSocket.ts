'use client';

import { useEffect, useCallback } from 'react';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/gameStore';
import { Player, HistoricalGame, MoveResult } from '@/types';

export function useSocket() {
  const {
    setConnected,
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

  return {
    joinRoom,
    selectGame,
    startGame: startGameAction,
    submitMove,
  };
}
