import {check,type Update} from '@tauri-apps/plugin-updater'
export type UpdateChannel='stable'|'beta'|'nightly';let pending:Update|null=null
export function normalizeUpdateChannel(v:unknown):UpdateChannel{return v==='beta'||v==='nightly'?v:'stable'}
export async function checkForUpdate(channel:UpdateChannel){if(typeof window==='undefined'||!window.__TAURI_INTERNALS__)return{available:false};if(pending)await pending.close().catch(()=>{});pending=await check({headers:{'X-Sush-Air-Channel':channel},timeout:10_000});return pending?{available:true,version:pending.version,notes:pending.body}:{available:false}}
export async function installPendingUpdate(){if(!pending)throw new Error('Check for an update first.');await pending.downloadAndInstall()}
