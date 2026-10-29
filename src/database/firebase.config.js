import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import serviceAccount from '@/database/serviceAccountKey.json';

const app = getApps().length === 0
  ? initializeApp({ credential: cert(serviceAccount) })
  : getApp();

export { app };