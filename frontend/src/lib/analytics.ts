import {
  trackAnalyticsEvent,
  identifyAnalyticsUser,
  resetAnalyticsUser,
} from './firebase';

// Type-safe event names for analytics
export type AnalyticsEvent =
  | 'practice_session_started'
  | 'practice_session_completed'
  | 'move_submitted'
  | 'voice_input_used'
  | 'voice_mode_changed'
  | 'game_selected';

interface PracticeSessionStartedProps {
  gameId: string;
  gameTitle: string;
  whitePlayer: string;
  blackPlayer: string;
  year: number;
  mode: 'both-sides' | 'one-side';
  playerColor?: 'white' | 'black';
  totalMoves: number;
}

interface PracticeSessionCompletedProps {
  gameId: string;
  gameTitle: string;
  correctMoves: number;
  incorrectMoves: number;
  totalMoves: number;
  accuracy: number;
  mode: 'both-sides' | 'one-side';
  xpEarned?: number;
  leveledUp?: boolean;
  newAchievements?: number;
}

interface MoveSubmittedProps {
  gameId: string;
  moveIndex: number;
  isCorrect: boolean;
  inputMethod: 'voice' | 'text';
  voiceMode?: 'webspeech-haiku' | 'gemini-audio';
}

interface VoiceInputUsedProps {
  voiceMode: 'webspeech-haiku' | 'gemini-audio';
  success: boolean;
  transcription?: string;
}

interface VoiceModeChangedProps {
  previousMode: 'webspeech-haiku' | 'gemini-audio';
  newMode: 'webspeech-haiku' | 'gemini-audio';
}

interface GameSelectedProps {
  gameId: string;
  gameTitle: string;
  whitePlayer: string;
  blackPlayer: string;
  year: number;
}

type EventProperties = {
  practice_session_started: PracticeSessionStartedProps;
  practice_session_completed: PracticeSessionCompletedProps;
  move_submitted: MoveSubmittedProps;
  voice_input_used: VoiceInputUsedProps;
  voice_mode_changed: VoiceModeChangedProps;
  game_selected: GameSelectedProps;
};

/**
 * Track an analytics event with type-safe properties
 */
export function trackEvent<T extends AnalyticsEvent>(
  event: T,
  properties: EventProperties[T]
): void {
  if (typeof window === 'undefined') return;

  try {
    trackAnalyticsEvent(event, properties as unknown as Record<string, unknown>);
  } catch (error) {
    // Silently fail if Analytics is not initialized
    console.debug('Analytics event not sent:', event, error);
  }
}

/**
 * Identify a user (call when user signs in)
 */
export function identifyUser(userId: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;

  try {
    identifyAnalyticsUser(userId, properties);
  } catch (error) {
    console.debug('User identification failed:', error);
  }
}

/**
 * Reset user identity (call on logout or session end)
 */
export function resetUser(): void {
  if (typeof window === 'undefined') return;

  try {
    resetAnalyticsUser();
  } catch (error) {
    console.debug('User reset failed:', error);
  }
}
