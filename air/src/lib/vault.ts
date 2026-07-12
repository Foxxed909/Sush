import {appLocalDataDir,join} from '@tauri-apps/api/path'
import {Stronghold,type Store} from '@tauri-apps/plugin-stronghold'
const INDEX='sush-air:v1:vault-index',memory=new Map<string,string>()
const available=()=>typeof window!=='undefined'&&!!window.__TAURI_INTERNALS__
const valid=(v:string)=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(v)
function password(v:string){if(v.length<12)throw new Error('Vault passphrase must contain at least 12 characters.');if(v.length>1024)throw new Error('Vault passphrase must contain at most 1,024 characters.')}
function keys(){try{const x=JSON.parse(localStorage.getItem(INDEX)||'[]');return Array.isArray(x)?x.map(String).filter(valid).slice(0,500):[]}catch{return[]}}
function index(v:string[]){localStorage.setItem(INDEX,JSON.stringify([...new Set(v.filter(valid))].sort().slice(0,500)))}
async function open(pass:string):Promise<{stronghold:Stronghold;store:Store}>{password(pass);const stronghold=await Stronghold.load(await join(await appLocalDataDir(),'air-vault.hold'),pass);let client;try{client=await stronghold.loadClient('sush-air')}catch{client=await stronghold.createClient('sush-air')}return{stronghold,store:client.getStore()}}
export const vaultKeys=keys
export async function vaultSet(k:string,v:string,p:string){if(!valid(k))throw new Error('Vault keys may contain letters, numbers, dots, dashes, and underscores.');if(new TextEncoder().encode(v).byteLength>64*1024)throw new Error('Vault values must be 64 KB or smaller.');password(p);if(!available()){memory.set(k,v);index([...keys(),k]);return}const{stronghold,store}=await open(p);try{await store.insert(k,Array.from(new TextEncoder().encode(v)));await stronghold.save();index([...keys(),k])}finally{await stronghold.unload()}}
export async function vaultGet(k:string,p:string){if(!valid(k))throw new Error('Invalid vault key.');password(p);if(!available())return memory.get(k)??null;const{stronghold,store}=await open(p);try{const v=await store.get(k);return v?new TextDecoder().decode(v):null}finally{await stronghold.unload()}}
export async function vaultRemove(k:string,p:string){if(!valid(k))throw new Error('Invalid vault key.');password(p);if(!available()){memory.delete(k);index(keys().filter(x=>x!==k));return}const{stronghold,store}=await open(p);try{await store.remove(k);await stronghold.save();index(keys().filter(x=>x!==k))}finally{await stronghold.unload()}}
