import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  linkWithCredential,
  linkWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  EmailAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  User,
  Auth,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import {
  getAnalytics,
  logEvent,
  setUserId,
  setUserProperties,
  Analytics,
  isSupported,
} from 'firebase/analytics';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate required Firebase config (check config object, not process.env - Next.js only inlines static access)
if (typeof window !== 'undefined' && (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.projectId)) {
  console.error('[Firebase] Missing required Firebase configuration. Check NEXT_PUBLIC_FIREBASE_* env vars.');
}

// Initialize Firebase (only once)
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let analytics: Analytics | null = null;
let analyticsReady: Promise<Analytics | null>;

if (typeof window !== 'undefined') {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  db = getFirestore(app);

  // Initialize Analytics (only in browser and if supported)
  analyticsReady = isSupported().then((supported) => {
    if (supported && firebaseConfig.measurementId) {
      analytics = getAnalytics(app);
      return analytics;
    }
    return null;
  });
} else {
  analyticsReady = Promise.resolve(null);
}

// OAuth Providers
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

// Auth functions
export async function signInAsGuest(): Promise<User> {
  const result = await signInAnonymously(auth);
  return result.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signInWithGithub(): Promise<User> {
  const result = await signInWithPopup(auth, githubProvider);
  return result.user;
}

// Upgrade anonymous user to permanent account
export async function upgradeAnonymousWithEmail(
  email: string,
  password: string
): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.isAnonymous) {
    throw new Error('No anonymous user to upgrade');
  }

  const credential = EmailAuthProvider.credential(email, password);
  const result = await linkWithCredential(currentUser, credential);
  return result.user;
}

export async function upgradeAnonymousWithGoogle(): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.isAnonymous) {
    throw new Error('No anonymous user to upgrade');
  }

  const result = await linkWithPopup(currentUser, googleProvider);
  return result.user;
}

export async function upgradeAnonymousWithGithub(): Promise<User> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.isAnonymous) {
    throw new Error('No anonymous user to upgrade');
  }

  const result = await linkWithPopup(currentUser, githubProvider);
  return result.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// Update user's display name in Firebase Auth
export async function updateDisplayName(displayName: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('No user logged in');
  await updateProfile(user, { displayName });
}

// Get current user's ID token for API calls
export async function getIdToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

// Subscribe to auth state changes
export function subscribeToAuthState(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

// Analytics helper functions
export async function trackAnalyticsEvent(
  eventName: string,
  eventParams?: Record<string, unknown>
): Promise<void> {
  const analyticsInstance = await analyticsReady;
  if (analyticsInstance) {
    logEvent(analyticsInstance, eventName, eventParams);
  }
}

export async function identifyAnalyticsUser(
  userId: string,
  userProperties?: Record<string, unknown>
): Promise<void> {
  const analyticsInstance = await analyticsReady;
  if (analyticsInstance) {
    setUserId(analyticsInstance, userId);
    if (userProperties) {
      setUserProperties(analyticsInstance, userProperties);
    }
  }
}

export async function resetAnalyticsUser(): Promise<void> {
  const analyticsInstance = await analyticsReady;
  if (analyticsInstance) {
    setUserId(analyticsInstance, '');
  }
}

export { auth, db, app, analytics };
export type { User };
