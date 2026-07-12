import {invoke} from '@tauri-apps/api/core'
import {listen,type UnlistenFn} from '@tauri-apps/api/event'
import {onOpenUrl} from '@tauri-apps/plugin-deep-link'
import type {GitPulse,HostPlatform,PortOwner,ProjectFingerprint,ResourceSnapshot,RuntimeInfo} from './types'
const browser=new Map<string,Set<(v:string)=>void>>(),tauri=()=>typeof window!=='undefined'&&!!window.__TAURI_INTERNALS__
const platform=():HostPlatform=>{const v=navigator.platform.toLowerCase();return v.includes('mac')?'macos':v.includes('win')?'windows':v.includes('linux')?'linux':'unknown'}
export async function runtimeInfo():Promise<RuntimeInfo>{return tauri()?invoke('runtime_info'):{tauri:false,platform:platform(),version:'browser-preview',homeDir:platform()==='windows'?'C:\\Users\\Air':'/Users/air',dropShortcutAvailable:true}}
export async function spawnTerminal(input:{id:string;cwd:string;shell:string;cols:number;rows:number;command?:string;privacy?:boolean}){if(tauri())return invoke<void>('terminal_spawn',{input});queueMicrotask(()=>{for(const fn of browser.get(input.id)||[])fn(`\u001b[35mSush Air preview\u001b[0m\r\n${input.cwd}\r\n$ `)})}
export async function writeTerminal(id:string,data:string){if(tauri())return invoke<void>('terminal_write',{id,data});for(const fn of browser.get(id)||[])fn(data==='\r'?'\r\n$ ':data)}
export async function resizeTerminal(id:string,cols:number,rows:number){if(tauri())await invoke('terminal_resize',{id,cols,rows})}
export async function killTerminal(id:string){if(tauri())await invoke('terminal_kill',{id});browser.delete(id)}
export async function onTerminalData(id:string,fn:(v:string)=>void):Promise<UnlistenFn>{if(tauri())return listen<string>(`air://terminal/${id}`,e=>fn(e.payload));const set=browser.get(id)||new Set();set.add(fn);browser.set(id,set);return()=>set.delete(fn)}
export async function inspectProject(cwd:string):Promise<ProjectFingerprint>{return tauri()?invoke('project_inspect',{cwd}):{cwd,kind:'preview',commands:['npm run dev','npm test'],markers:['browser fallback']}}
export async function gitPulse(cwd:string):Promise<GitPulse>{return tauri()?invoke('git_pulse',{cwd}):{branch:'preview',dirty:0,staged:0,ahead:0,behind:0,conflicted:0}}
export async function listPorts():Promise<PortOwner[]>{return tauri()?invoke('port_list'):[]}
export async function runTask(id:string,label:string,command:string,cwd:string){if(tauri())await invoke('task_run',{input:{id,label,command,cwd}})}
export async function stopTask(id:string){if(tauri())await invoke('task_stop',{id})}
export async function onTaskEvent(id:string,fn:(e:{kind:'output'|'done';data?:string;code?:number})=>void):Promise<UnlistenFn>{if(tauri())return listen(`air://task/${id}`,e=>fn(e.payload as never));const timer=window.setTimeout(()=>fn({kind:'done',code:0}),500);return()=>clearTimeout(timer)}
export async function createWorktree(input:{repository:string;name:string;branch:string}):Promise<string>{return tauri()?invoke('worktree_create',{input}):`${input.repository}/.sush-worktrees/${input.name}`}
export async function removeWorktree(repository:string,path:string){if(tauri())await invoke('worktree_remove',{repository,path})}
export async function listWorktrees(repository:string):Promise<Array<{path:string;name:string}>>{return tauri()?invoke('worktree_list',{repository}):[]}
export async function resourceSnapshot():Promise<ResourceSnapshot>{return tauri()?invoke('resource_snapshot'):{appMemoryMb:0,appCpuPercent:0,childProcesses:0,activeSessions:browser.size,capturedAt:Date.now()}}
export async function nativePowerStatus(){return tauri()?invoke<{supported:boolean;charging:boolean;level:number}>('power_status'):{supported:false,charging:true,level:1}}
export async function toggleDrop(){return tauri()?invoke<{allowed:boolean;remaining:number|null}>('drop_toggle'):{allowed:true,remaining:null}}
export async function dropStatus(){return tauri()?invoke<{allowed:boolean;remaining:number|null}>('drop_status'):{allowed:true,remaining:null}}
export async function setDropPinned(pinned:boolean){if(tauri())await invoke('drop_set_pinned',{pinned})}
export async function updateTrayWorkspaces(workspaces:Array<{label:string;cwd:string}>){if(tauri())await invoke('tray_set_workspaces',{workspaces:workspaces.slice(0,8)})}
export async function verifyLicenseToken(token:string):Promise<{plan:string;expiresAt?:string}>{if(!tauri())throw new Error('License verification is available only in the packaged app.');return invoke('license_verify',{token})}
export async function detectAgents():Promise<Array<{id:string;label:string;command:string;available:boolean}>>{return tauri()?invoke('agent_detect'):[{id:'codex',label:'Codex',command:'codex',available:true},{id:'claude',label:'Claude Code',command:'claude',available:false},{id:'aider',label:'Aider',command:'aider',available:false}]}
export async function prepareContextPack(cwd:string):Promise<{files:string[];diff:string;truncated:boolean}>{return tauri()?invoke('context_pack',{cwd}):{files:[],diff:'',truncated:false}}
const absolute=(v:unknown):v is string=>typeof v==='string'&&v.length<=4096&&!v.includes('\0')&&/^(?:[A-Za-z]:[\\/]|\/|\\\\)/.test(v)
export async function onContextLaunch(fn:(cwd:string,source:'launch'|'tray'|'deep-link')=>void):Promise<UnlistenFn>{if(!tauri())return()=>{};const stops:UnlistenFn[]=[];stops.push(await listen<{cwd?:string}>('air://context-launch',e=>{if(absolute(e.payload.cwd))fn(e.payload.cwd,'launch')}));stops.push(await listen<{cwd:string}>('air://open-workspace',e=>{if(absolute(e.payload.cwd))fn(e.payload.cwd,'tray')}));stops.push(await onOpenUrl(urls=>urls.forEach(raw=>{try{const u=new URL(raw),cwd=u.searchParams.get('cwd');if(u.protocol==='sush-air:'&&absolute(cwd))fn(cwd,'deep-link')}catch{}})));return()=>stops.forEach(x=>x())}
export async function onDropLimit(fn:()=>void){return tauri()?listen('air://drop-limit',fn):()=>{}}
export async function onDropMode(fn:(v:boolean)=>void){return tauri()?listen<boolean>('air://drop-mode',e=>fn(e.payload)):()=>{}}
export async function onRuntimeError(fn:(v:string)=>void){return tauri()?listen<string>('air://runtime-error',e=>fn(e.payload)):()=>{}}
