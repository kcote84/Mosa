import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
export function adminContext(local = false) {
  const projectId = local ? 'demo-mosa' : 'mosa-506ef';
  if (local) {
    process.env.GCLOUD_PROJECT = projectId;
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';
  }
  // Reuse the machine's Google application credentials; never create or export a service-account key.
  if (!local) process.env.GOOGLE_CLOUD_QUOTA_PROJECT = projectId;
  if (!getApps().length) initializeApp({ projectId, storageBucket: `${projectId}.firebasestorage.app`, ...(local ? {} : { credential: applicationDefault() }) });
  return { db: getFirestore(), auth: getAuth(), bucket: getStorage().bucket(), projectId };
}
