// src/lib/comingsoon-firebase.ts

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase'; // Assuming your firebase config is here

// Interface defining the structure of a feature request document
interface FeatureRequest {
  requestText: string;
  createdAt: any; // Use serverTimestamp() for reliable timing
  userId?: string | null; // Optional: ID of the user submitting
  userEmail?: string | null; // Optional: Email of the user submitting
}

// Function to save the feature request
export async function saveFeatureRequest(
  requestText: string,
  userId?: string | null,
  userEmail?: string | null
): Promise<string> { // Return the new document ID
  if (!requestText.trim()) {
    throw new Error('Feature request text cannot be empty.');
  }

  try {
    // Get a reference to the 'featureRequests' collection
    const requestsRef = collection(db, 'featureRequests');

    // Prepare the data object
    const requestData: FeatureRequest = {
      requestText: requestText.trim(),
      createdAt: serverTimestamp(), // Use Firestore server timestamp
      userId: userId || null,
      userEmail: userEmail || null, // Store email if available
    };

    // Add the document to the collection
    const docRef = await addDoc(requestsRef, requestData);
    console.log('Feature request saved with ID:', docRef.id);
    return docRef.id; // Return the ID of the newly created document

  } catch (error) {
    console.error('Error saving feature request:', error);
    // Throw a more specific error message if possible, otherwise a generic one
    throw new Error('Failed to submit your feature request. Please try again later.');
  }
}
