import admin from 'firebase-admin';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK
// Credentials come from environment variables
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  // Private key needs newlines to be unescaped
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

// Only initialize if not already initialized
if (!admin.apps.length) {
  if (!firebaseConfig.projectId || !firebaseConfig.clientEmail || !firebaseConfig.privateKey) {
    console.warn('Firebase Admin SDK not configured - missing environment variables');
  } else {
    admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig as admin.ServiceAccount),
    });
    console.log('Firebase Admin SDK initialized');
  }
}

export const auth: Auth = admin.auth();
export const firestore: Firestore = admin.firestore();

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

export default admin;
