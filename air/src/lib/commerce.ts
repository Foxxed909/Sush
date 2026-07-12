import {open} from '@tauri-apps/plugin-shell'
const base=String(import.meta.env.VITE_SUSH_AIR_CHECKOUT_URL||'')
export function checkoutAvailable(){try{return new URL(base).protocol==='https:'}catch{return false}}
export async function openCheckout(billing:'monthly'|'lifetime'){if(!checkoutAvailable())throw new Error('Air checkout is not configured for this build.');const url=new URL(base);url.searchParams.set('plan',billing==='monthly'?'air-monthly':'air-lifetime');url.searchParams.set('source','sush-air-app');if(window.__TAURI_INTERNALS__)await open(url.toString());else window.open(url.toString(),'_blank','noopener,noreferrer')}
