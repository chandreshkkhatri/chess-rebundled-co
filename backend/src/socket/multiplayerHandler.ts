import { Server, Socket } from 'socket.io';
import { MultiplayerService } from '../services/multiplayerService.js';
import { MatchmakingService } from '../services/matchmakingService.js';
import { parseChessMoveWithAI, AIParsedMove } from '../services/aiMoveParser.js';
import { parseChessMoveFromAudio } from '../services/geminiAudioParser.js';
import { ClientToServerEvents, ServerToClientEvents } from '../types/index.js';
import { TimeControl } from '../types/multiplayer.js';
import { WaitingPlayer } from '../services/matchmakingService.js';
import crypto from 'crypto';

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// AI parsing cache entry
interface AIParseCacheEntry {
  result: AIParsedMove;
  timestamp: number;
}

export class MultiplayerHandler {
  private multiplayerService: MultiplayerService;
  private matchmakingService: MatchmakingService;
  private aiParseCache: Map<string, AIParseCacheEntry> = new Map();
  private static readonly AI_CACHE_TTL_MS = 5 * 60 * 1000;
  private static readonly AI_CACHE_MAX_SIZE = 500;

  // Track socket -> gameId for disconnect handling
  private socketToGame: Map<string, string> = new Map();
  private onLobbyChange: (() => void) | null = null;

  constructor(private io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.multiplayerService = new MultiplayerService(io);
    this.matchmakingService = new MatchmakingService();
  }

  setOnLobbyChange(callback: () => void): void {
    this.onLobbyChange = callback;
  }

  getWaitingPlayers(): WaitingPlayer[] {
    return this.matchmakingService.getWaitingPlayers();
  }

  register(socket: GameSocket): void {
    // Matchmaking
    socket.on('mp-find-game', (data) => this.handleFindGame(socket, data));
    socket.on('mp-cancel-find', () => this.handleCancelFind(socket));
    socket.on('mp-create-invite', (data) => this.handleCreateInvite(socket, data));
    socket.on('mp-join-invite', (data) => this.handleJoinInvite(socket, data));

    // Gameplay
    socket.on('mp-submit-move', (data) => this.handleSubmitMove(socket, data));
    socket.on('mp-resign', (data) => this.handleResign(socket, data));
    socket.on('mp-offer-draw', (data) => this.handleOfferDraw(socket, data));
    socket.on('mp-respond-draw', (data) => this.handleRespondDraw(socket, data));

    // Connection
    socket.on('mp-reconnect', (data) => this.handleReconnect(socket, data));

    // AI parsing
    socket.on('mp-parse-move-with-ai', (data) => this.handleParseMoveWithAI(socket, data));
    socket.on('mp-parse-audio-move-with-gemini', (data) => this.handleParseAudioMove(socket, data));

    // Disconnect
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  // --- Matchmaking ---

  private async handleFindGame(
    socket: GameSocket,
    data: { timeControl: TimeControl | null | 'any' }
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit('mp-error', { message: 'Authentication required for multiplayer' });
      return;
    }

    const displayName = socket.data.email?.split('@')[0] || 'Player';

    // Check if already in a game
    const existingGameId = await this.multiplayerService.getGame(
      (await this.getActiveGameId(uid)) || ''
    ).then(g => g?.id);
    if (existingGameId) {
      socket.emit('mp-error', { message: 'You already have an active game' });
      return;
    }

    const matchResult = this.matchmakingService.addToQueue(
      { uid, displayName, socketId: socket.id, joinedAt: Date.now() },
      data.timeControl
    );

    if (matchResult) {
      const { opponent, matchedTimeControl } = matchResult;

      // Match found - create game with the resolved time control
      const game = await this.multiplayerService.createGame(
        opponent.uid,
        opponent.displayName,
        opponent.socketId,
        matchedTimeControl
      );

      const joinResult = await this.multiplayerService.joinGame(
        game.id,
        uid,
        displayName,
        socket.id
      );

      if (!joinResult) {
        socket.emit('mp-error', { message: 'Failed to create game' });
        return;
      }

      const { game: fullGame } = joinResult;

      // Both sockets join the room
      const opponentSocket = this.io.sockets.sockets.get(opponent.socketId);
      if (opponentSocket) {
        opponentSocket.join(`mp:${fullGame.id}`);
        this.socketToGame.set(opponent.socketId, fullGame.id);
      }
      socket.join(`mp:${fullGame.id}`);
      this.socketToGame.set(socket.id, fullGame.id);

      // Emit to creator (opponent in queue)
      if (opponentSocket) {
        const creatorColor = fullGame.white.uid === opponent.uid ? 'white' : 'black';
        const creatorOpponent = creatorColor === 'white' ? fullGame.black : fullGame.white;
        opponentSocket.emit('mp-game-found', {
          gameId: fullGame.id,
          playerColor: creatorColor,
          opponent: { uid: creatorOpponent.uid, displayName: creatorOpponent.displayName },
          fen: fullGame.fen,
          timeControl: fullGame.timeControl,
          whiteTimeMs: fullGame.white.timeRemainingMs,
          blackTimeMs: fullGame.black.timeRemainingMs,
        });
      }

      // Emit to joiner (this socket)
      const joinerColor = fullGame.white.uid === uid ? 'white' : 'black';
      const joinerOpponent = joinerColor === 'white' ? fullGame.black : fullGame.white;
      socket.emit('mp-game-found', {
        gameId: fullGame.id,
        playerColor: joinerColor,
        opponent: { uid: joinerOpponent.uid, displayName: joinerOpponent.displayName },
        fen: fullGame.fen,
        timeControl: fullGame.timeControl,
        whiteTimeMs: fullGame.white.timeRemainingMs,
        blackTimeMs: fullGame.black.timeRemainingMs,
      });

      console.log(`[Multiplayer] Game ${fullGame.id} started: ${fullGame.white.displayName} vs ${fullGame.black.displayName}`);
      this.onLobbyChange?.();
    } else {
      // Queued, waiting for opponent
      socket.emit('mp-searching');
      this.onLobbyChange?.();
    }
  }

  private handleCancelFind(socket: GameSocket): void {
    const uid = socket.data.uid;
    if (!uid) return;

    this.matchmakingService.removeFromQueue(uid);
    socket.emit('mp-search-cancelled');
    this.onLobbyChange?.();
  }

  private async handleCreateInvite(
    socket: GameSocket,
    data: { timeControl: TimeControl | null }
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit('mp-error', { message: 'Authentication required for multiplayer' });
      return;
    }

    const displayName = socket.data.email?.split('@')[0] || 'Player';
    const inviteCode = crypto.randomBytes(4).toString('hex'); // 8 char code

    const game = await this.multiplayerService.createGame(
      uid,
      displayName,
      socket.id,
      data.timeControl,
      inviteCode
    );

    socket.join(`mp:${game.id}`);
    this.socketToGame.set(socket.id, game.id);

    socket.emit('mp-invite-created', { inviteCode, gameId: game.id });
    console.log(`[Multiplayer] Invite created: ${inviteCode} for game ${game.id}`);
  }

  private async handleJoinInvite(
    socket: GameSocket,
    data: { inviteCode: string }
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit('mp-error', { message: 'Authentication required for multiplayer' });
      return;
    }

    const { multiplayerStore } = await import('../services/multiplayerSessionStore.js');
    const gameId = await multiplayerStore.getGameIdByInviteCode(data.inviteCode);
    if (!gameId) {
      socket.emit('mp-error', { message: 'Invite code not found or expired' });
      return;
    }

    const displayName = socket.data.email?.split('@')[0] || 'Player';
    const joinResult = await this.multiplayerService.joinGame(gameId, uid, displayName, socket.id);

    if (!joinResult) {
      socket.emit('mp-error', { message: 'Could not join game. It may have already started.' });
      return;
    }

    const { game } = joinResult;

    socket.join(`mp:${game.id}`);
    this.socketToGame.set(socket.id, game.id);

    // Notify creator
    const creatorSocket = game.white.uid !== uid
      ? this.io.sockets.sockets.get(game.white.socketId!)
      : this.io.sockets.sockets.get(game.black.socketId!);

    if (creatorSocket) {
      const creatorColor = game.white.uid !== uid ? 'white' : 'black';
      const creatorOpponent = creatorColor === 'white' ? game.black : game.white;
      creatorSocket.emit('mp-game-found', {
        gameId: game.id,
        playerColor: creatorColor,
        opponent: { uid: creatorOpponent.uid, displayName: creatorOpponent.displayName },
        fen: game.fen,
        timeControl: game.timeControl,
        whiteTimeMs: game.white.timeRemainingMs,
        blackTimeMs: game.black.timeRemainingMs,
      });
    }

    // Notify joiner
    const joinerColor = game.white.uid === uid ? 'white' : 'black';
    const joinerOpponent = joinerColor === 'white' ? game.black : game.white;
    socket.emit('mp-game-found', {
      gameId: game.id,
      playerColor: joinerColor,
      opponent: { uid: joinerOpponent.uid, displayName: joinerOpponent.displayName },
      fen: game.fen,
      timeControl: game.timeControl,
      whiteTimeMs: game.white.timeRemainingMs,
      blackTimeMs: game.black.timeRemainingMs,
    });

    console.log(`[Multiplayer] Player joined via invite: game ${game.id}`);
  }

  // --- Gameplay ---

  private async handleSubmitMove(
    socket: GameSocket,
    data: { gameId: string; move: string }
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit('mp-error', { message: 'Authentication required' });
      return;
    }

    const result = await this.multiplayerService.processMove(data.gameId, uid, data.move);

    if (!result.success) {
      socket.emit('mp-illegal-move', { move: data.move, reason: result.error || 'Invalid move' });
      return;
    }

    // Broadcast move to both players
    this.io.to(`mp:${data.gameId}`).emit('mp-move-made', {
      gameId: data.gameId,
      move: result.move!,
      fen: result.fen!,
      turn: result.turn!,
      moveCount: result.moveCount!,
      whiteTimeMs: result.whiteTimeMs!,
      blackTimeMs: result.blackTimeMs!,
      isCheck: result.isCheck || false,
    });

    // Broadcast game over if applicable
    if (result.gameOver) {
      const game = await this.multiplayerService.getGame(data.gameId);
      if (game) {
        const { Chess } = await import('chess.js');
        const chess = new Chess();
        for (const m of game.moves) {
          try { chess.move(m); } catch { break; }
        }
        this.io.to(`mp:${data.gameId}`).emit('mp-game-over', {
          gameId: data.gameId,
          result: result.gameOver.result,
          endReason: result.gameOver.reason,
          winner: result.gameOver.winner,
          fen: result.fen!,
          pgn: chess.pgn(),
          moves: game.moves,
          whiteTimeMs: result.whiteTimeMs!,
          blackTimeMs: result.blackTimeMs!,
        });
      }
    }
  }

  private async handleResign(
    socket: GameSocket,
    data: { gameId: string }
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) return;

    const gameOverData = await this.multiplayerService.resign(data.gameId, uid);
    if (gameOverData) {
      this.io.to(`mp:${data.gameId}`).emit('mp-game-over', gameOverData);
    }
  }

  private async handleOfferDraw(
    socket: GameSocket,
    data: { gameId: string }
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) return;

    const offeredBy = await this.multiplayerService.offerDraw(data.gameId, uid);
    if (offeredBy) {
      this.io.to(`mp:${data.gameId}`).emit('mp-draw-offered', { by: offeredBy });
    }
  }

  private async handleRespondDraw(
    socket: GameSocket,
    data: { gameId: string; accept: boolean }
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) return;

    const gameOverData = await this.multiplayerService.respondToDraw(data.gameId, uid, data.accept);
    if (gameOverData) {
      // Draw accepted
      this.io.to(`mp:${data.gameId}`).emit('mp-game-over', gameOverData);
    } else if (!data.accept) {
      // Draw declined
      this.io.to(`mp:${data.gameId}`).emit('mp-draw-declined');
    }
  }

  // --- Connection ---

  private async handleReconnect(
    socket: GameSocket,
    data: { gameId: string }
  ): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) {
      socket.emit('mp-game-not-found', { gameId: data.gameId, reason: 'Authentication required' });
      return;
    }

    const resumeData = await this.multiplayerService.handlePlayerReconnect(
      data.gameId, uid, socket.id
    );

    if (!resumeData) {
      socket.emit('mp-game-not-found', { gameId: data.gameId, reason: 'Game not found or already completed' });
      return;
    }

    socket.join(`mp:${data.gameId}`);
    this.socketToGame.set(socket.id, data.gameId);

    socket.emit('mp-game-resumed', resumeData);

    // Notify opponent
    socket.to(`mp:${data.gameId}`).emit('mp-opponent-connected', {
      displayName: resumeData.opponent.displayName,
    });

    console.log(`[Multiplayer] Player reconnected to game ${data.gameId}`);
  }

  private async handleDisconnect(socket: GameSocket): Promise<void> {
    const uid = socket.data.uid;
    if (!uid) return;

    // Remove from matchmaking queue
    this.matchmakingService.removeFromQueue(uid);
    this.onLobbyChange?.();

    // Handle active game disconnect
    const gameId = this.socketToGame.get(socket.id);
    if (gameId) {
      this.socketToGame.delete(socket.id);

      await this.multiplayerService.handlePlayerDisconnect(gameId, uid);

      // Notify opponent
      socket.to(`mp:${gameId}`).emit('mp-opponent-disconnected');
    }
  }

  // --- AI Parsing ---

  private async handleParseMoveWithAI(
    socket: GameSocket,
    data: { gameId: string; transcript: string }
  ): Promise<void> {
    const game = await this.multiplayerService.getGame(data.gameId);
    if (!game) {
      socket.emit('mp-parse-error', { message: 'Game not found' });
      return;
    }

    const legalMoves = this.multiplayerService.getLegalMoves(game.fen);

    try {
      const cacheKey = this.getAIParseCacheKey(data.transcript, game.fen);
      let cached = this.aiParseCache.get(cacheKey);
      let parsed: AIParsedMove;

      if (cached && Date.now() - cached.timestamp < MultiplayerHandler.AI_CACHE_TTL_MS) {
        parsed = cached.result;
      } else {
        parsed = await parseChessMoveWithAI(data.transcript, game.fen, legalMoves);
        this.cacheAIParse(cacheKey, parsed);
      }

      socket.emit('mp-move-parsed', {
        transcript: data.transcript,
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
      });
    } catch (error) {
      socket.emit('mp-parse-error', {
        message: `AI parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  private async handleParseAudioMove(
    socket: GameSocket,
    data: { gameId: string; audioBase64: string; mimeType: string }
  ): Promise<void> {
    const game = await this.multiplayerService.getGame(data.gameId);
    if (!game) {
      socket.emit('mp-audio-parse-error', { message: 'Game not found' });
      return;
    }

    const legalMoves = this.multiplayerService.getLegalMoves(game.fen);

    try {
      const parsed = await parseChessMoveFromAudio(
        data.audioBase64, data.mimeType, game.fen, legalMoves
      );

      socket.emit('mp-audio-move-parsed', {
        transcript: parsed.transcription || '[audio input]',
        parsedMove: parsed.move,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        reasoning: parsed.reasoning,
      });
    } catch (error) {
      socket.emit('mp-audio-parse-error', {
        message: `Audio parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  // --- Helpers ---

  private async getActiveGameId(uid: string): Promise<string | undefined> {
    const { multiplayerStore } = await import('../services/multiplayerSessionStore.js');
    return multiplayerStore.getGameIdByUid(uid);
  }

  private getAIParseCacheKey(transcript: string, fen: string): string {
    const data = `${transcript.toLowerCase().trim()}:${fen}`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  private cacheAIParse(key: string, result: AIParsedMove): void {
    this.aiParseCache.set(key, { result, timestamp: Date.now() });
    if (this.aiParseCache.size > MultiplayerHandler.AI_CACHE_MAX_SIZE) {
      const entries = Array.from(this.aiParseCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      entries.slice(0, 50).forEach(([k]) => this.aiParseCache.delete(k));
    }
  }
}
