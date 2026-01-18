export interface ScoreResult {
  moveScore: number;
  accuracy: number;
}

export class ScoringService {
  /**
   * Calculate score for a single move
   * Formula: S = (T_remaining / T_total) × Accuracy
   *
   * @param timeRemaining - milliseconds remaining when move was submitted
   * @param timeTotal - total time allowed (usually 10000ms)
   * @param isCorrect - whether the move was correct
   */
  calculateMoveScore(
    timeRemaining: number,
    timeTotal: number,
    isCorrect: boolean
  ): ScoreResult {
    const accuracy = isCorrect ? 1.0 : 0.0;
    const timeRatio = Math.max(0, timeRemaining) / timeTotal;
    const moveScore = timeRatio * accuracy;

    return {
      moveScore,
      accuracy,
    };
  }

  /**
   * Calculate normalized total score
   * Formula: TS = Σ(S) / N_moves
   * This ensures games of different lengths are comparable
   */
  calculateNormalizedScore(moveScores: number[]): number {
    if (moveScores.length === 0) return 0;
    const totalScore = moveScores.reduce((sum, score) => sum + score, 0);
    return totalScore / moveScores.length;
  }

  /**
   * Determine winner based on normalized scores
   */
  determineWinner(
    player1Score: number,
    player2Score: number
  ): 'player1' | 'player2' | 'tie' {
    const threshold = 0.001; // Tie threshold
    const difference = player1Score - player2Score;

    if (Math.abs(difference) < threshold) {
      return 'tie';
    }
    return difference > 0 ? 'player1' : 'player2';
  }
}
