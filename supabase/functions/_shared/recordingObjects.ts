import { AwsClient } from 'npm:aws4fetch@1.0.20';
import { readStoredRecording } from '../../../src/storage/privateRecordingServer.js';
const config = { accountId: Deno.env.get('R2_ACCOUNT_ID'), bucket: Deno.env.get('R2_MIGRATION_BUCKET') };
const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID'), secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
export function loadRecordingObject(db: any, location: any) {
  return readStoredRecording({ db, location, config, signedFetch: (url: string, options: RequestInit) => {
    if (!accessKeyId || !secretAccessKey) throw Error('R2 not configured');
    return new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto', retries: 1 }).fetch(url, options);
  } });
}
