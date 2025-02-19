// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDaMAlQRMXiDsZ4P0b06P18id3y5xBiZ1k",
  authDomain: "deepworkai-c3419.firebaseapp.com",
  projectId: "deepworkai-c3419",
  storageBucket: "deepworkai-c3419.appspot.com",
  messagingSenderId: "367439182644",
  appId: "1:367439182644:web:304216430df97eff68c361"
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Export the Auth, Firestore, and Storage instances
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// File Type Pricing
export const pricing = {
  'Basic': {
      'pdf': 50,
      'png': 40,
      'jpg': 40,
      'jpeg': 40,
      'mp3': 60,
      'wav': 60,
      'mp4': 100,
      'mov': 100,
      'docx': 50,
      'zip': 80,
      '*': 70
  },
  'Pro': {
      'pdf': 30,
      'png': 25,
      'jpg': 25,
      'jpeg': 25,
      'mp3': 40,
      'wav': 40,
      'mp4': 75,
      'mov': 75,
      'docx': 30,
      'zip': 60,
      '*': 50
  },
  'Premium': {
      'pdf': 20,
      'png': 15,
      'jpg': 15,
      'jpeg': 15,
      'mp3': 25,
      'wav': 25,
      'mp4': 50,
      'mov': 50,
      'docx': 20,
      'zip': 40,
      '*': 30
  }
};
