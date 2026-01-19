import { Challenge } from '../types/index.js';

export class ChallengeService {
  private challenges: Map<string, Challenge> = new Map();
  private socketToChallengeId: Map<string, string> = new Map();

  createChallenge(socketId: string, playerName: string): Challenge {
    // Remove any existing challenge from this socket
    this.removeChallengeBySocketId(socketId);

    const challenge: Challenge = {
      id: `challenge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      creatorSocketId: socketId,
      creatorName: playerName,
      createdAt: Date.now(),
    };

    this.challenges.set(challenge.id, challenge);
    this.socketToChallengeId.set(socketId, challenge.id);
    return challenge;
  }

  getChallenge(challengeId: string): Challenge | undefined {
    return this.challenges.get(challengeId);
  }

  getAllChallenges(): Challenge[] {
    return Array.from(this.challenges.values()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
  }

  removeChallenge(challengeId: string): boolean {
    const challenge = this.challenges.get(challengeId);
    if (challenge) {
      this.socketToChallengeId.delete(challenge.creatorSocketId);
      this.challenges.delete(challengeId);
      return true;
    }
    return false;
  }

  removeChallengeBySocketId(socketId: string): string | null {
    const challengeId = this.socketToChallengeId.get(socketId);
    if (challengeId) {
      this.challenges.delete(challengeId);
      this.socketToChallengeId.delete(socketId);
      return challengeId;
    }
    return null;
  }

  getChallengeBySocketId(socketId: string): Challenge | undefined {
    const challengeId = this.socketToChallengeId.get(socketId);
    return challengeId ? this.challenges.get(challengeId) : undefined;
  }
}
