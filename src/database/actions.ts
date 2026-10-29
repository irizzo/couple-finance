import { getFirestore } from 'firebase-admin/firestore';
import { app } from './firebase.config';

// Initialize Firestore
const db = getFirestore(app);

export default db;