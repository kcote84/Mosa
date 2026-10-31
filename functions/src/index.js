import { onRequest } from 'firebase-functions/v2/https';
import { app } from './app.js';
export const api = onRequest({ region: 'us-east1', serviceAccount: 'mosa-runtime@mosa-506ef.iam.gserviceaccount.com', memory: '512MiB', timeoutSeconds: 60, maxInstances: 3, concurrency: 2, invoker: 'public' }, app);
