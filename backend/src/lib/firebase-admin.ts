import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
// Credentials come from environment variables
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Private key needs newlines to be unescaped
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Only initialize if not already initialized
if (!getApps().length) {
  if (!firebaseConfig.projectId || !firebaseConfig.clientEmail || !firebaseConfig.privateKey) {
    console.warn('Firebase Admin SDK not configured - missing environment variables');
  } else {
    initializeApp({
      credential: cert(firebaseConfig as ServiceAccount),
    });
    console.log('Firebase Admin SDK initialized');
  }
}

export const auth: Auth = getAuth();
export const firestore: Firestore = getFirestore();

// Verify a Firebase ID token and return the decoded token
export async function verifyIdToken(idToken: string): Promise<DecodedIdToken | null> {
  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return null;
  }
}
