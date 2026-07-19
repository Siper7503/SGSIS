import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as firebaseSignOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleAuthProvider);
export const signOut = () => firebaseSignOut(auth);
export { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail };
