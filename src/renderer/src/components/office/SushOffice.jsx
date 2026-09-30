import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  PerspectiveCamera, PlaneGeometry, Raycaster, Scene, Vector2, Vector3, WebGLRenderer
} from 'three'
import Icon from '../Icons'
import ProviderLogo from '../ProviderLogo'
import { agentById } from '../../lib/agents'
import { STATES } from '../../lib/agentActivity'
import { PICKER_PROVIDERS, formatTokens, pickerRows } from '../../lib/nightlyModels'
import {
  WALL_H, WALL_T, buildCampusLayout, buildInteriorLayout, campusLayoutKey, interiorLayoutKey,
  moveWithCollisions, nearestInteractable
} from '../../lib/officeLayout'
import { levelFor, officeHeadcount, transcriptTokens } from '../../lib/officeStats'
import { OFFICE_THEMES, loadOfficeThemes, officeTheme, saveOfficeTheme } from '../../lib/officeThemes'
import { threadKey } from '../../lib/shellSidebar'
import { subscribeThreadFeed } from '../../lib/threadFeedStore'
import { terminalTail } from '../../lib/terminalRegistry'
import { workspaceKey } from '../../lib/workspaces'
import {
  backdropTexture, box, buildBoard, buildBuilding, buildDesk, buildKiosk, buildStatue, buildTree,
  checkerTexture, disposeTree, mat, openingRing, paintScreen, sit, stand, voxelPerson
} from './officeScene'
import { threadCentered } from '../../lib/shellModes'

// Sush Office — a 3D pixel campus over the same live sessions as every other
// view. One building per project folder; inside, a desk per agent whose
// monitor mirrors its real terminal. Nothing here owns session state: desks
// are tabs, poses are agent states, and "open" / "hire" call the same actions
// as the sidebar and launcher.
//
// Pixel look: the scene renders at 1/PIXEL resolution and is scaled up with
// `image-rendering: pixelated`; all text is crisp DOM positioned on 3D anchors.
// Battery: display-rate frames only while you move or the camera flies;
// otherwise the loop wakes at the ambient rate, and stops when hidden.

const PIXEL = 3
const WALK = 4.4
const RUN = 7.5
const IDLE_FPS = 12
const WALK_IN_MS = 2600
const OPENING_MS = 1100

function stateOf(tabId, states, limits, tabs) {
  if (limits[tabId]) return 'limit'
  if (tabs.find(t => t.id === tabId)?.status === 'exited') return 'error'
  return states[tabId] || 'idle'
}
const STATE_COLOR = id => (id === 'limit' ? '#ff9f43' : STATES[id]?.color || STATES.idle.color)

export default function SushOffice({
  tabs = [],
  states = {},
  limits = {},
  accent = '#ff6b9d',
  reduceMotion = false,
  ledger = { agents: {}, offices: {} },
  awardTokens,
  focusTabId = null,
  onFocusMonitor,
  onExitMonitor,
  onEnterTerminal,
  onNewOffice,
  onHire,
  onChat,
  onAgents
}) {
  const hostRef = useRef(null)
  const overlayRef = useRef(null)
  const engineRef = useRef(null)
  const liveRef = useRef({})
  const [place, setPlace] = useState({ kind: 'campus' })
  const [themes, setThemes] = useState(loadOfficeThemes)
  const [hint, setHint] = useState(null)
  const [hireOpen, setHireOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [tokens, setTokens] = useState({})

  const campusKey = campusLayoutKey(tabs)
  const campus = useMemo(() => buildCampusLayout(tabs), [campusKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const interiorKey = place.kind === 'interior' ? interiorLayoutKey(tabs, place.key) : null
  const interior = useMemo(
    () => (place.kind === 'interior' ? buildInteriorLayout(tabs, place.key) : null),
    [interiorKey] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const layout = interior || campus
  const officeKey = interior?.key || null
  const theme = officeTheme(officeKey ? themes[officeKey] : 'loft')

  // A closed project's building disappears; don't leave the player inside it.
  useEffect(() => {
    if (place.kind === 'interior' && !campus.buildings.some(b => b.key === place.key)) setPlace({ kind: 'campus' })
  }, [campus, place])

  liveRef.current = { tabs, states, limits, focusTabId, onFocusMonitor, onNewOffice, onChat, onAgents, setPlace, setHireOpen }

  // ── Engine: renderer, camera, player, input, loop. Once per accent/motion. ──
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    let renderer
    try {
      renderer = new WebGLRenderer({ antialias: false, powerPreference: 'low-power' })
    } catch {
      setFailed(true)
      return undefined
    }
    renderer.setPixelRatio(1)
    renderer.domElement.className = 'office-canvas'
    host.appendChild(renderer.domElement)

    const scene = new Scene()
    const hemi = new HemisphereLight('#c9d2ff', '#1a1210', 1.3)
    const sun = new DirectionalLight('#ffe9f1', 1.5)
    sun.position.set(6, 14, 9)
    scene.add(hemi, sun)
    const camera = new PerspectiveCamera(42, 1, 0.1, 140)
    const player = voxelPerson(accent)
    scene.add(player)

    const keys = new Set()
    const engine = {
      renderer, scene, camera, player, keys, hemi, sun,
      world: null, layout: null, place: null, pos: { x: 0, z: 0 }, facing: 0, walkPhase: 0,
      dirty: true, nearest: null, lost: false, anchors: new Map(), desks: [], windows: [],
      animations: [], knownBuildings: null, seenDesks: new Map(), camTarget: null, look: null
    }
    engineRef.current = engine

    const resize = () => {
      const w = Math.max(1, host.clientWidth)
      const h = Math.max(1, host.clientHeight)
      renderer.setSize(Math.ceil(w / PIXEL), Math.ceil(h / PIXEL), false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      engine.dirty = true
    }
    const observer = new ResizeObserver(resize)
    observer.observe(host)
    resize()

    let raf = 0
    let timer = 0
    const kick = () => { if (!raf) { clearTimeout(timer); raf = requestAnimationFrame(frame) } }
    engine.kick = kick

    const interact = (target = engine.nearest) => {
      if (!target) return
      const live = liveRef.current
      if (target.kind === 'session') live.onFocusMonitor?.(target.tabId)
      else if (target.kind === 'enter') live.setPlace({ kind: 'interior', key: target.key })
      else if (target.kind === 'exit') live.setPlace({ kind: 'campus' })
      else if (target.kind === 'hire') live.setHireOpen(true)
      else if (target.kind === 'new-office') live.onNewOffice?.()
      else if (target.kind === 'chat') live.onChat?.()
      else if (target.kind === 'agents') live.onAgents?.()
    }
    const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'])
    const onKeyDown = (e) => {
      if (liveRef.current.focusTabId) return
      const key = e.key.toLowerCase()
      if (MOVE_KEYS.has(key)) { keys.add(key); e.preventDefault(); kick() }
      if ((key === 'e' || key === 'enter') && !e.repeat) { e.preventDefault(); interact() }
      if (key === 'escape' && engine.place?.kind === 'interior') { e.preventDefault(); liveRef.current.setPlace({ kind: 'campus' }) }
    }
    const onKeyUp = (e) => keys.delete(e.key.toLowerCase())
    const onBlur = () => keys.clear()
    host.addEventListener('keydown', onKeyDown)
    host.addEventListener('keyup', onKeyUp)
    host.addEventListener('blur', onBlur)

    const raycaster = new Raycaster()
    const onClick = (e) => {
      host.focus()
      if (!engine.layout || !engine.world || liveRef.current.focusTabId) return
      const rect = renderer.domElement.getBoundingClientRect()
      raycaster.setFromCamera(new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera)
      const hit = raycaster.intersectObject(engine.world, true)[0]
      if (!hit) return
      const target = nearestInteractable({ x: hit.point.x, z: hit.point.z + 0.6 }, engine.layout, 2.2)
      if (target) interact(target)
    }
    renderer.domElement.addEventListener('click', onClick)
    const onLost = (e) => { e.preventDefault(); engine.lost = true }
    const onRestored = () => { engine.lost = false; engine.dirty = true; kick() }
    renderer.domElement.addEventListener('webglcontextlost', onLost)
    renderer.domElement.addEventListener('webglcontextrestored', onRestored)

    let last = performance.now()
    let lastDraw = 0
    let lastPaint = 0
    const tmp = new Vector3()
    const look = new Vector3()
    const projected = new Vector3()

    const placeOverlays = () => {
      const layer = overlayRef.current
      if (!layer) return
      const w = host.clientWidth
      const h = host.clientHeight
      for (const el of layer.children) {
        const anchor = engine.anchors.get(el.dataset.anchor)
        if (!anchor) { el.style.display = 'none'; continue }
        projected.copy(anchor).project(camera)
        const visible = projected.z < 1 && Math.abs(projected.x) < 1 && projected.y < 1.05 && projected.y > -1
        el.style.display = visible ? '' : 'none'
        if (visible) el.style.transform = `translate(-50%, -100%) translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px)`
      }
    }

    function frame(now) {
      raf = 0
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const hidden = document.visibilityState !== 'visible'
      const layoutNow = engine.layout
      let busy = false
      if (!hidden && layoutNow) {
        const live = liveRef.current
        // ── movement ──
        let mx = 0
        let mz = 0
        if (!live.focusTabId) {
          if (keys.has('w') || keys.has('arrowup')) mz -= 1
          if (keys.has('s') || keys.has('arrowdown')) mz += 1
          if (keys.has('a') || keys.has('arrowleft')) mx -= 1
          if (keys.has('d') || keys.has('arrowright')) mx += 1
        }
        const moving = !!(mx || mz)
        if (moving) {
          const len = Math.hypot(mx, mz)
          const speed = (keys.has('shift') ? RUN : WALK) * dt
          engine.pos = moveWithCollisions(engine.pos, (mx / len) * speed, (mz / len) * speed, layoutNow.colliders)
          engine.facing = Math.atan2(mx, mz)
          engine.walkPhase += dt * (keys.has('shift') ? 14 : 10)
          engine.dirty = true
        }
        const p = player.userData.parts
        const swing = moving ? Math.sin(engine.walkPhase) * 0.6 : 0
        p.legL.rotation.x = swing; p.legR.rotation.x = -swing
        p.armL.rotation.x = -swing; p.armR.rotation.x = swing
        player.position.set(engine.pos.x, 0, engine.pos.z)
        player.rotation.y += ((engine.facing - player.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12)
        player.visible = !live.focusTabId

        // ── camera: follow, or fly into a monitor ──
        const campusCam = engine.place?.kind === 'campus'
        if (live.focusTabId && engine.camTarget) {
          tmp.copy(engine.camTarget.pos)
          look.copy(engine.camTarget.look)
        } else {
          tmp.set(engine.pos.x, campusCam ? 15 : 6.4, engine.pos.z + (campusCam ? 15 : 6.8))
          look.set(engine.pos.x, 0.9, engine.pos.z - (campusCam ? 7 : 2.4))
        }
        if (!engine.look) { engine.look = look.clone(); camera.position.copy(tmp) }
        const flying = camera.position.distanceTo(tmp) > 0.02 || engine.look.distanceTo(look) > 0.02
        camera.position.lerp(tmp, reduceMotion ? 1 : Math.min(1, dt * (live.focusTabId ? 4 : moving ? 5 : 8)))
        engine.look.lerp(look, reduceMotion ? 1 : Math.min(1, dt * 6))
        camera.lookAt(engine.look)
        if (flying) { engine.dirty = true; busy = true }

        // ── agents + windows reflect live state ──
        const t = now / 1000
        for (const group of engine.desks) {
          const { desk, person, walkIn } = group.userData
          if (!desk.tabId || !person) continue
          const id = stateOf(desk.tabId, live.states, live.limits, live.tabs)
          if (walkIn) {
            const k = Math.min(1, (now - walkIn.start) / WALK_IN_MS)
            person.position.lerpVectors(walkIn.from, walkIn.to, k)
            person.rotation.y = Math.atan2(walkIn.to.x - walkIn.from.x, walkIn.to.z - walkIn.from.z)
            const parts = person.userData.parts
            const s = Math.sin(k * 30) * 0.6
            parts.legL.rotation.x = s; parts.legR.rotation.x = -s
            if (k >= 1) { group.userData.walkIn = null; person.position.copy(walkIn.to); person.rotation.y = Math.PI; sit(person) }
            engine.dirty = true
            busy = true
            continue
          }
          if (!reduceMotion) {
            const parts = person.userData.parts
            const typing = id === 'working'
            parts.armL.rotation.x = typing ? -1.1 + Math.sin(t * 18 + desk.x) * 0.25 : -0.9
            parts.armR.rotation.x = typing ? -1.1 + Math.cos(t * 18 + desk.z) * 0.25 : -0.9
            parts.armR.rotation.z = id === 'waiting' ? 2.6 : 0
            parts.head.rotation.x = id === 'limit' ? 0.5 : id === 'error' ? -0.2 : Math.sin(t * 1.3 + desk.x) * 0.05
          }
        }
        for (const win of engine.windows) {
          const id = win.tabId ? stateOf(win.tabId, live.states, live.limits, live.tabs) : 'off'
          const color = id === 'off' ? '#2a2438' : id === 'idle' || id === 'done' ? '#3a3350' : STATE_COLOR(id)
          if (win.mesh.material.color.getHexString() !== color.slice(1)) { win.mesh.material.color.set(color); engine.dirty = true }
        }
        const statue = engine.world?.userData.statue
        if (statue && !reduceMotion) { statue.userData.orb.rotation.y = t; statue.userData.orb.position.y = 1.8 + Math.sin(t * 2) * 0.08 }

        // ── opening animations ──
        engine.animations = engine.animations.filter(anim => {
          const k = Math.min(1, (now - anim.start) / OPENING_MS)
          anim.step(reduceMotion ? 1 : 1 - Math.pow(1 - k, 3))
          engine.dirty = true
          busy = true
          return k < 1
        })

        // ── live monitors (~1 Hz) ──
        if (now - lastPaint > 1000 && engine.place?.kind === 'interior') {
          lastPaint = now
          for (const group of engine.desks) {
            const { desk, screen } = group.userData
            if (!screen) continue
            const tail = terminalTail(desk.tabId, 14)
            const id = stateOf(desk.tabId, live.states, live.limits, live.tabs)
            const paintKey = `${id}|${tail}`
            if (paintKey === group.userData.lastPaint) continue
            group.userData.lastPaint = paintKey
            const lines = tail.split('\n').map(l => l.replace(/\s+$/, ''))
            while (lines.length && !lines[lines.length - 1]) lines.pop()
            paintScreen(screen, { lines, color: STATE_COLOR(id), bg: '#07060c', title: desk.label, sleeping: !tail })
            engine.dirty = true
          }
        }

        // ── what's in reach ──
        const near = live.focusTabId ? null : nearestInteractable(engine.pos, layoutNow)
        if ((near?.id || null) !== (engine.nearest?.id || null)) {
          engine.nearest = near
          setHint(near ? { label: near.label, kind: near.kind } : null)
        }

        const ambient = !reduceMotion && now - lastDraw > 1000 / IDLE_FPS
        if (!engine.lost && (engine.dirty || moving || ambient)) {
          renderer.render(scene, camera)
          placeOverlays()
          lastDraw = now
          engine.dirty = false
        }
        busy = busy || moving
      }
      const wait = hidden ? 500 : busy || keys.size ? 0 : reduceMotion ? 250 : 1000 / IDLE_FPS
      if (!wait) raf = requestAnimationFrame(frame)
      else timer = setTimeout(() => { raf = requestAnimationFrame(frame) }, wait)
    }
    raf = requestAnimationFrame(frame)
    host.focus()

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      observer.disconnect()
      host.removeEventListener('keydown', onKeyDown)
      host.removeEventListener('keyup', onKeyUp)
      host.removeEventListener('blur', onBlur)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('webglcontextlost', onLost)
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored)
      disposeTree(scene)
      renderer.dispose()
      renderer.domElement.remove()
      engineRef.current = null
    }
  }, [accent, reduceMotion])

  // ── World: rebuilt when the place, its sessions or its theme change. ──
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    const samePlace = !!engine.place && engine.place.kind === (interior ? 'interior' : 'campus') && (!interior || engine.place.key === interior.key)
    const leaving = !samePlace && engine.place?.kind === 'interior' ? engine.place.key : null
    if (engine.world) { engine.scene.remove(engine.world); disposeTree(engine.world) }
    const world = new Group()
    const anchors = new Map()
    engine.desks = []
    engine.windows = []
    engine.animations = []
    const now = performance.now()

    if (interior) {
      const t = theme
      engine.scene.background = new Color(t.sky[0])
      engine.scene.fog = new Fog(t.fog, 16, 34)
      engine.hemi.color.set(t.light)
      const { room } = interior
      const w = room.maxX - room.minX
      const d = room.maxZ - room.minZ
      const ground = new Mesh(new PlaneGeometry(w, d), new MeshLambertMaterial({ map: checkerTexture(t.floorA, t.floorB, w / 2, d / 2) }))
      ground.rotation.x = -Math.PI / 2
      world.add(ground)
      const rug = new Mesh(new PlaneGeometry(w - 2, d - 3), new MeshLambertMaterial({ color: t.rug }))
      rug.rotation.x = -Math.PI / 2
      rug.position.set(0, 0.005, -0.5)
      world.add(rug)
      const wall = mat(t.wall)
      const trim = mat(t.trim === 'accent' ? accent : t.trim)
      world.add(box(w, WALL_H, WALL_T, wall, 0, WALL_H / 2, room.minZ - WALL_T / 2))
      world.add(box(WALL_T, WALL_H, d, wall, room.minX - WALL_T / 2, WALL_H / 2, 0))
      world.add(box(WALL_T, WALL_H, d, wall, room.maxX + WALL_T / 2, WALL_H / 2, 0))
      const side = (w - interior.doorW) / 2
      world.add(box(side, 0.6, WALL_T, wall, room.minX + side / 2, 0.3, room.maxZ))
      world.add(box(side, 0.6, WALL_T, wall, room.maxX - side / 2, 0.3, room.maxZ))
      // Door marked on the floor, not with a lintel that blocks the camera.
      const mat2 = new Mesh(new PlaneGeometry(interior.doorW, 0.6), new MeshLambertMaterial({ color: t.trim === 'accent' ? accent : t.trim }))
      mat2.rotation.x = -Math.PI / 2
      mat2.position.set(0, 0.01, room.maxZ - 0.4)
      world.add(mat2)
      world.add(box(w, 0.04, 0.04, trim, 0, WALL_H, room.minZ - 0.02))
      // Back-wall window onto the theme's backdrop.
      const view = new Mesh(new PlaneGeometry(w * 0.7, 1.3), new MeshBasicMaterial({ map: backdropTexture(t) }))
      view.position.set(0, 1.45, room.minZ + 0.02)
      world.add(view)

      const seen = engine.seenDesks.get(interior.key)
      const nextSeen = new Set()
      for (const desk of interior.desks) {
        const group = buildDesk({ desk, theme: t, accent })
        world.add(group)
        engine.desks.push(group)
        anchors.set(desk.tabId ? `desk:${desk.tabId}` : 'desk:hire', group.userData.anchors.label)
        if (!desk.tabId) continue
        nextSeen.add(desk.tabId)
        const agent = agentById(desk.agentId) || agentById('shell')
        const person = voxelPerson(agent?.color || '#8b9bb0')
        const seat = new Vector3(0, 0.05, 0.72)
        group.add(person)
        group.userData.person = person
        // Someone hired while you're here walks in through the door.
        if (samePlace && seen && !seen.has(desk.tabId) && !reduceMotion) {
          const from = new Vector3(interior.door.x - desk.x, 0, interior.door.z - 0.6 - desk.z)
          stand(person)
          person.position.copy(from)
          group.userData.walkIn = { start: now, from, to: seat }
        } else {
          person.position.copy(seat)
          person.rotation.y = Math.PI
          sit(person)
        }
      }
      engine.seenDesks.set(interior.key, nextSeen)
    } else {
      engine.scene.background = new Color('#0c0a12')
      engine.scene.fog = new Fog('#0c0a12', 30, 70)
      engine.hemi.color.set('#c9d2ff')
      const { floor } = campus
      const w = floor.maxX - floor.minX
      const d = floor.maxZ - floor.minZ
      const ground = new Mesh(new PlaneGeometry(w, d), new MeshLambertMaterial({ map: checkerTexture('#15131d', '#191623', w / 2, d / 2) }))
      ground.rotation.x = -Math.PI / 2
      ground.position.set((floor.minX + floor.maxX) / 2, 0, (floor.minZ + floor.maxZ) / 2)
      world.add(ground)
      const path = new Mesh(new PlaneGeometry(3, d), new MeshLambertMaterial({ color: '#211d2c' }))
      path.rotation.x = -Math.PI / 2
      path.position.set(0, 0.004, (floor.minZ + floor.maxZ) / 2)
      world.add(path)

      const known = engine.knownBuildings
      const nextKnown = new Set()
      for (const building of campus.buildings) {
        const group = buildBuilding(building, officeTheme(themes[building.key]), accent)
        world.add(group)
        engine.windows.push(...group.userData.windows)
        anchors.set(`sign:${building.key}`, group.userData.anchors.sign)
        nextKnown.add(building.key)
        // A folder launched since the campus was last built: the office opens.
        if (known && !known.has(building.key)) {
          const ring = openingRing(building.door.x, building.door.z + 1, accent)
          world.add(ring)
          group.scale.y = 0.01
          engine.animations.push({
            start: now,
            step: k => {
              group.scale.y = Math.max(0.01, k)
              ring.scale.setScalar(1 + k * 5)
              ring.material.opacity = 0.9 * (1 - k)
            }
          })
        }
      }
      engine.knownBuildings = nextKnown
      const kiosk = buildKiosk(campus.kiosk, accent)
      const statue = buildStatue(campus.seducia, accent)
      const board = buildBoard(campus.board)
      world.add(kiosk, statue, board)
      world.userData.statue = statue
      anchors.set('kiosk', kiosk.userData.anchors.label)
      anchors.set('seducia', statue.userData.anchors.label)
      anchors.set('board', board.userData.anchors.label)
      for (const [x, z] of [[floor.minX + 3, floor.maxZ - 3], [floor.maxX - 3, floor.maxZ - 3], [floor.minX + 3, campus.seducia.z], [floor.maxX - 3, campus.seducia.z]]) {
        world.add(buildTree(x, z))
      }
    }

    engine.scene.add(world)
    engine.world = world
    engine.anchors = anchors
    engine.layout = layout
    if (!samePlace) {
      // Entering: start inside the door. Leaving: step out of that building.
      const building = leaving ? campus.buildings.find(b => b.key === leaving) : null
      engine.pos = building ? { x: building.door.x, z: building.door.z + 1.6 } : { ...layout.spawn }
      engine.facing = building ? 0 : Math.PI
      engine.camTarget = null
      engine.look = null
    } else {
      engine.pos = moveWithCollisions(engine.pos, 0, 0, layout.colliders)
    }
    engine.place = interior ? { kind: 'interior', key: interior.key } : { kind: 'campus' }
    engine.dirty = true
    engine.kick?.()
  }, [layout, interior, campus, theme, themes, accent, reduceMotion]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fly into a monitor when App focuses one; back out when it clears.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (focusTabId) {
      const group = engine.desks.find(g => g.userData.desk.tabId === focusTabId)
      if (group) {
        const m = group.userData.anchors.monitor
        engine.camTarget = { pos: new Vector3(m.x, m.y + 0.05, m.z + 1.05), look: m.clone() }
      }
    } else {
      engine.camTarget = null
      hostRef.current?.focus()
    }
    engine.dirty = true
    engine.kick?.()
  }, [focusTabId])

  // Tokens for this office's Claude desks, from the shared Thread feed.
  const officeTabs = useMemo(() => (officeKey ? tabs.filter(t => workspaceKey(t) === officeKey) : []), [tabs, officeKey])
  const bridged = useMemo(() => officeTabs.filter(t => threadCentered(t)), [officeTabs])
  const awardRef = useRef(awardTokens)
  awardRef.current = awardTokens
  useEffect(() => {
    const unsubs = bridged.map(tab => subscribeThreadFeed(tab.id, snapshot => {
      const items = Array.isArray(snapshot?.state?.items) ? snapshot.state.items : []
      const totals = transcriptTokens(items)
      setTokens(prev => (prev[tab.id]?.total === totals.total && prev[tab.id]?.context === totals.context ? prev : { ...prev, [tab.id]: totals }))
      if (totals.output) awardRef.current?.(tab, totals.output)
    }))
    return () => unsubs.forEach(u => u())
  }, [bridged])

  const setOfficeTheme = useCallback((id) => {
    if (officeKey) setThemes(prev => saveOfficeTheme(prev, officeKey, id))
  }, [officeKey])

  const totals = useMemo(() => officeHeadcount(tabs, states, limits), [tabs, states, limits])
  const officeCounts = useMemo(() => officeHeadcount(officeTabs, states, limits), [officeTabs, states, limits])
  const officeLevel = levelFor(officeKey ? ledger.offices?.[officeKey] : Object.values(ledger.offices || {}).reduce((a, b) => a + b, 0))
  const focusTab = focusTabId ? tabs.find(t => t.id === focusTabId) : null

  if (failed) {
    return (
      <div className="office-fallback">
        <strong>The office needs WebGL.</strong>
        <span>Your GPU or power settings blocked it. Every agent is still in the sidebar and in Agents.</span>
      </div>
    )
  }

  return (
    <div className={`office${focusTabId ? ' is-focused' : ''}`}>
      <div ref={hostRef} className="office-host" tabIndex={0} aria-label="Sush Office. Move with W A S D or the arrow keys, press E to interact." />

      <div ref={overlayRef} className="office-labels">
        {!interior && campus.buildings.map(b => {
          const counts = officeHeadcount(tabs.filter(t => b.tabIds.includes(t.id)), states, limits)
          const lvl = levelFor(ledger.offices?.[b.key])
          return (
            <div
              key={`sign:${b.key}`}
              data-anchor={`sign:${b.key}`}
              className="office-sign is-clickable"
              role="button"
              tabIndex={-1}
              title={`Enter ${b.label}`}
              onClick={() => setPlace({ kind: 'interior', key: b.key })}
            >
              <div className="office-sign-head">
                <strong>{b.label}</strong>
                <span className="office-level" title={`${Math.round(lvl.xp)} XP`}>Lv {lvl.level}</span>
              </div>
              <div className="office-sign-crew">
                {counts.providers.map(p => (
                  <span key={p.agentId} title={agentById(p.agentId)?.label}><ProviderLogo provider={p.agentId} size={13} />×{p.count}</span>
                ))}
              </div>
              <div className="office-sign-states">
                {counts.working > 0 && <em className="is-working">{counts.working} working</em>}
                {counts.waiting > 0 && <em className="is-waiting">{counts.waiting} need you</em>}
                {counts.limit > 0 && <em className="is-limit">{counts.limit} at limit</em>}
                {counts.idle > 0 && <em>{counts.idle} idle</em>}
              </div>
            </div>
          )
        })}
        {!interior && <div data-anchor="kiosk" className="office-tag is-accent is-clickable" role="button" tabIndex={-1} onClick={() => onNewOffice?.()}>+ New office</div>}
        {!interior && <div data-anchor="seducia" className="office-tag is-accent">Seducia</div>}
        {!interior && <div data-anchor="board" className="office-tag">Agents board</div>}
        {interior && interior.desks.map(desk => {
          if (!desk.tabId) return <div key="hire" data-anchor="desk:hire" className="office-tag is-accent is-dashed is-clickable" role="button" tabIndex={-1} onClick={() => setHireOpen(true)}>+ Hire an agent</div>
          const id = stateOf(desk.tabId, states, limits, tabs)
          const tab = tabs.find(t => t.id === desk.tabId)
          const lvl = levelFor(ledger.agents?.[threadKey(tab || { id: desk.tabId })]?.xp)
          const tk = tokens[desk.tabId]
          return (
            <div
              key={desk.tabId}
              data-anchor={`desk:${desk.tabId}`}
              className={`office-desk-tag is-clickable is-${id}`}
              role="button"
              tabIndex={-1}
              title={`Open ${desk.label}'s screen`}
              onClick={() => onFocusMonitor?.(desk.tabId)}
            >
              <ProviderLogo provider={desk.agentId} size={12} />
              <span className="office-desk-name">{desk.label}</span>
              <span className="office-level">Lv {lvl.level}</span>
              {tk?.total ? <span className="office-desk-tokens" title={`${tk.total.toLocaleString()} tokens used · ${tk.context?.toLocaleString() || '—'} in context`}>{formatTokens(tk.total)}</span> : null}
              {(id === 'waiting' || id === 'limit' || id === 'error') && <i className="office-desk-alert">!</i>}
            </div>
          )
        })}
      </div>

      <div className="office-hud">
        {interior ? (
          <>
            <button className="office-chip is-button" onClick={() => setPlace({ kind: 'campus' })} title="Back to campus (Esc)">
              <Icon name="arrowLeft" size={12} /> Campus
            </button>
            <span className="office-chip is-title">{interior.label}</span>
            <span className="office-chip">
              {officeCounts.providers.map(p => (
                <span key={p.agentId} className="office-crew"><ProviderLogo provider={p.agentId} size={12} />{p.count}</span>
              ))}
              {!officeCounts.total && 'No agents yet'}
            </span>
            {officeCounts.working > 0 && <span className="office-chip is-working">{officeCounts.working} working</span>}
            {officeCounts.waiting > 0 && <span className="office-chip is-waiting">{officeCounts.waiting} need you</span>}
            <label className="office-chip is-button office-theme">
              <Icon name="palette" size={12} />
              <select value={theme.id} onChange={e => setOfficeTheme(e.target.value)} aria-label="Office theme">
                {OFFICE_THEMES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <span className="office-chip is-title">Campus</span>
            <span className="office-chip">{campus.buildings.length} office{campus.buildings.length === 1 ? '' : 's'}</span>
            <span className="office-chip">
              {totals.providers.map(p => (
                <span key={p.agentId} className="office-crew"><ProviderLogo provider={p.agentId} size={12} />{p.count}</span>
              ))}
              {!totals.total && 'No agents yet'}
            </span>
            {totals.working > 0 && <span className="office-chip is-working">{totals.working} working</span>}
            {totals.waiting > 0 && <span className="office-chip is-waiting">{totals.waiting} need you</span>}
          </>
        )}
        <span className="office-chip office-xp" title={`${Math.round(officeLevel.xp)} XP · next level at ${officeLevel.nextXp}`}>
          Lv {officeLevel.level}
          <i><b style={{ width: `${Math.round(officeLevel.progress * 100)}%` }} /></i>
        </span>
      </div>
      <div className="office-keys">WASD move · Shift run · E use · click anything{interior ? ' · Esc campus' : ''}</div>

      {hint && !focusTabId && (
        <div className={`office-hint is-${hint.kind}`}>
          <kbd>E</kbd> {hint.kind === 'session' ? `Open ${hint.label}'s screen` : hint.label}
        </div>
      )}

      {hireOpen && interior && (
        <HirePanel
          office={interior}
          onClose={() => { setHireOpen(false); hostRef.current?.focus() }}
          onHire={(spec) => { setHireOpen(false); onHire?.({ ...spec, cwd: interior.cwd, groupId: interior.groupId }); hostRef.current?.focus() }}
        />
      )}

      {focusTab && (
        <>
          <button className="office-monitor-scrim" aria-label="Back to the office" onClick={() => onExitMonitor?.()} />
          <div className="office-monitor-bar">
            <span><ProviderLogo provider={focusTab.agentId} size={13} /> {focusTab.label}</span>
            <button onClick={() => onEnterTerminal?.(focusTab.id)}><Icon name="maximize" size={12} /> Enter terminal</button>
            <button onClick={() => onExitMonitor?.()}><Icon name="arrowLeft" size={12} /> Back to office</button>
          </div>
        </>
      )}
    </div>
  )
}

function HirePanel({ office, onClose, onHire }) {
  const [agentId, setAgentId] = useState('claude')
  const [model, setModel] = useState('')
  const [count, setCount] = useState(1)
  const models = useMemo(() => pickerRows({ section: agentId }), [agentId])
  useEffect(() => { setModel('') }, [agentId])
  return (
    <div className="office-hire" role="dialog" aria-label={`Hire an agent for ${office.label}`}>
      <header>
        <strong>Hire for {office.label}</strong>
        <button onClick={onClose} aria-label="Close"><Icon name="x" size={13} /></button>
      </header>
      <div className="office-hire-providers">
        {PICKER_PROVIDERS.map(id => (
          <button key={id} className={id === agentId ? 'is-on' : undefined} onClick={() => setAgentId(id)} title={agentById(id)?.label}>
            <ProviderLogo provider={id} size={20} />
            <span>{agentById(id)?.label}</span>
          </button>
        ))}
      </div>
      <label className="office-hire-row">
        <span>Model</span>
        <select value={model} onChange={e => setModel(e.target.value)}>
          {models.map(m => <option key={m.key} value={m.value || ''}>{m.label}</option>)}
        </select>
      </label>
      <div className="office-hire-row">
        <span>How many</span>
        <div className="office-hire-count">
          <button onClick={() => setCount(c => Math.max(1, c - 1))} aria-label="Fewer">−</button>
          <strong>{count}</strong>
          <button onClick={() => setCount(c => Math.min(4, c + 1))} aria-label="More">+</button>
        </div>
      </div>
      <button className="office-hire-go" onClick={() => onHire({ agentId, model: model || null, count })}>
        Hire {count} {agentById(agentId)?.label}{count > 1 ? 's' : ''}
      </button>
      <small>They start in this office's folder and walk in to their desks.</small>
    </div>
  )
}
