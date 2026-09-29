import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry, Vector2, Vector3, CanvasTexture, Color, DirectionalLight, Fog, Group, HemisphereLight, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, NearestFilter, PerspectiveCamera, PlaneGeometry, Raycaster, RepeatWrapping, Scene, Sprite, SpriteMaterial, WebGLRenderer
} from 'three'
import { agentById } from '../../lib/agents'
import { STATES } from '../../lib/agentActivity'
import {
  DESK_D, DESK_W, DOOR_W, LOBBY_D, WALL_H, WALL_T,
  buildOfficeLayout, moveWithCollisions, nearestInteractable, officeLayoutKey
} from '../../lib/officeLayout'

// Sush Office — a 3D pixel office over the same live sessions as every other
// view. Nothing here owns state: desks are tabs, monitors are agent states,
// and walking up to something just calls the same actions as the sidebar.
//
// Pixel look: the scene renders at 1/PIXEL resolution with nearest filtering
// and the canvas is scaled up with `image-rendering: pixelated`.
// Battery: the loop idles at a low frame rate, stops while the window is
// hidden, and draws only on input/state changes under reduce-motion.

const PIXEL = 3
const WALK = 4.2
const RUN = 7
const IDLE_FPS = 12

const mat = (color, extra = {}) => new MeshLambertMaterial({ color, flatShading: true, ...extra })

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  return mesh
}

function textSprite(text, { color = '#f7f8f8', bg = 'rgba(8,9,10,0.82)', size = 28, scale = 0.012 } = {}) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `700 ${size}px ui-monospace, monospace`
  const w = Math.ceil(ctx.measureText(text).width) + size
  canvas.width = w
  canvas.height = size * 1.6
  ctx.font = `700 ${size}px ui-monospace, monospace`
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height) }
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, size / 2, canvas.height / 2)
  const texture = new CanvasTexture(canvas)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
  sprite.scale.set(canvas.width * scale, canvas.height * scale, 1)
  return sprite
}

function floorTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 16
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#16171a'; ctx.fillRect(0, 0, 16, 16)
  ctx.fillStyle = '#1b1c20'; ctx.fillRect(0, 0, 8, 8); ctx.fillRect(8, 8, 8, 8)
  const texture = new CanvasTexture(canvas)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.wrapS = texture.wrapT = RepeatWrapping
  return texture
}

// A voxel person: legs, body in the agent's colour, head, two eyes.
function voxelPerson(color) {
  const group = new Group()
  const body = mat(color)
  const dark = mat('#23252b')
  const skin = mat('#f1c7a8')
  const legL = box(0.16, 0.45, 0.18, dark, -0.1, 0.225, 0)
  const legR = box(0.16, 0.45, 0.18, dark, 0.1, 0.225, 0)
  const torso = box(0.46, 0.5, 0.28, body, 0, 0.7, 0)
  const armL = box(0.12, 0.44, 0.14, body, -0.3, 0.72, 0)
  const armR = box(0.12, 0.44, 0.14, body, 0.3, 0.72, 0)
  const head = box(0.36, 0.34, 0.34, skin, 0, 1.13, 0)
  const eyeMat = mat('#08090a')
  head.add(box(0.05, 0.06, 0.02, eyeMat, -0.08, 0.02, 0.175))
  head.add(box(0.05, 0.06, 0.02, eyeMat, 0.08, 0.02, 0.175))
  // Pivot limbs at the shoulder/hip so walking and sitting rotate naturally.
  legL.geometry.translate(0, -0.225, 0); legL.position.y += 0.225
  legR.geometry.translate(0, -0.225, 0); legR.position.y += 0.225
  armL.geometry.translate(0, -0.18, 0); armL.position.y += 0.18
  armR.geometry.translate(0, -0.18, 0); armR.position.y += 0.18
  group.add(legL, legR, torso, armL, armR, head)
  group.userData.parts = { legL, legR, armL, armR, head, torso }
  return group
}

function buildDesk(desk, accent, labels) {
  const group = new Group()
  group.position.set(desk.x, 0, desk.z)
  const wood = mat('#2a2c33')
  const top = box(DESK_W, 0.08, DESK_D, wood, 0, 0.74, 0)
  group.add(top)
  for (const [lx, lz] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]]) {
    group.add(box(0.07, 0.72, 0.07, wood, lx, 0.36, lz))
  }
  const screenMat = new MeshBasicMaterial({ color: desk.tabId ? '#6b7787' : accent })
  const monitor = box(0.78, 0.5, 0.06, mat('#0f1011'), 0, 1.08, -0.22)
  const screen = new Mesh(new PlaneGeometry(0.68, 0.4), screenMat)
  screen.position.set(0, 0, 0.032)
  monitor.add(screen)
  group.add(monitor, box(0.08, 0.2, 0.08, mat('#0f1011'), 0, 0.86, -0.22))
  group.userData = { desk, screenMat }

  if (desk.tabId) {
    const agent = agentById(desk.agentId) || agentById('shell')
    const chair = box(0.5, 0.08, 0.5, mat('#1f2024'), 0, 0.46, 0.75)
    chair.add(box(0.5, 0.55, 0.08, mat('#1f2024'), 0, 0.3, 0.22))
    group.add(chair)
    const person = voxelPerson(agent?.color || '#8b9bb0')
    person.position.set(0, 0.05, 0.72)
    person.rotation.y = Math.PI
    // Seated: fold the legs forward.
    person.userData.parts.legL.rotation.x = person.userData.parts.legR.rotation.x = -Math.PI / 2.2
    group.add(person)
    labels.push({ text: desk.label, kind: 'desk', x: desk.x, y: 2.05, z: desk.z + 0.6 })
    const badge = textSprite('!', { color: '#08090a', bg: '#ffcb6b', size: 30, scale: 0.012 })
    badge.position.set(0, 2.45, 0.6)
    badge.visible = false
    group.add(badge)
    group.userData.person = person
    group.userData.badge = badge
  } else {
    labels.push({ text: '+ new session', kind: 'new', x: desk.x, y: 1.7, z: desk.z })
  }
  return group
}

function buildWorld(layout, accent) {
  const world = new Group()
  // Text is drawn as crisp DOM labels projected from these anchors — pixel-
  // scaled canvas text was unreadable at 1/PIXEL resolution.
  const labels = []
  const { floor } = layout
  const tex = floorTexture()
  tex.repeat.set((floor.maxX - floor.minX) / 2, (floor.maxZ - floor.minZ) / 2)
  const ground = new Mesh(
    new PlaneGeometry(floor.maxX - floor.minX, floor.maxZ - floor.minZ),
    new MeshLambertMaterial({ map: tex })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.set((floor.minX + floor.maxX) / 2, 0, (floor.minZ + floor.maxZ) / 2)
  world.add(ground)

  const wallMat = mat('#1f2024')
  const trim = mat(accent)
  const desks = []
  for (const room of layout.rooms) {
    const x0 = room.x - room.w / 2
    const x1 = room.x + room.w / 2
    world.add(box(room.w, WALL_H, WALL_T, wallMat, room.x, WALL_H / 2, -room.d - WALL_T / 2))
    world.add(box(WALL_T, WALL_H, room.d, wallMat, x0 - WALL_T / 2, WALL_H / 2, -room.d / 2))
    world.add(box(WALL_T, WALL_H, room.d, wallMat, x1 + WALL_T / 2, WALL_H / 2, -room.d / 2))
    const side = (room.w - DOOR_W) / 2
    // Front walls are low so the camera sees into the room.
    world.add(box(side, 0.6, WALL_T, wallMat, x0 + side / 2, 0.3, 0))
    world.add(box(side, 0.6, WALL_T, wallMat, x1 - side / 2, 0.3, 0))
    world.add(box(room.w, 0.04, 0.06, trim, room.x, WALL_H + 0.02, -room.d - WALL_T / 2))
    const rug = new Mesh(new PlaneGeometry(room.w - 1, room.d - 1), new MeshLambertMaterial({ color: '#131417' }))
    rug.rotation.x = -Math.PI / 2
    rug.position.set(room.x, 0.005, -room.d / 2)
    world.add(rug)
    labels.push({ text: room.label + (room.overflow ? `  +${room.overflow} more` : ''), kind: 'room', x: room.x, y: 1.1, z: 0.3 })
    for (const desk of room.desks) {
      const group = buildDesk(desk, accent, labels)
      desks.push(group)
      world.add(group)
    }
  }

  // Lobby: Seducia at reception, the Agents board by the door.
  const s = layout.lobby.seducia
  world.add(box(2.6, 0.9, 1, mat('#2a2c33'), s.x, 0.45, s.z))
  world.add(box(2.6, 0.05, 1.04, mat(accent), s.x, 0.92, s.z))
  const seducia = voxelPerson('#ff6b9d')
  seducia.position.set(s.x, 0, s.z - 0.9)
  world.add(seducia)
  const orb = new Mesh(new IcosahedronGeometry(0.16, 0), new MeshBasicMaterial({ color: accent }))
  orb.position.set(s.x + 0.8, 1.2, s.z)
  world.add(orb)
  labels.push({ text: 'Seducia', kind: 'seducia', x: s.x, y: 2.05, z: s.z - 0.9 })

  const b = layout.lobby.board
  const board = box(3, 1.6, 0.12, mat('#0f1011'), b.x, 1.3, b.z)
  world.add(board, box(0.1, 0.5, 0.1, mat('#2a2c33'), b.x - 1.2, 0.25, b.z), box(0.1, 0.5, 0.1, mat('#2a2c33'), b.x + 1.2, 0.25, b.z))
  labels.push({ text: 'Agents board', kind: 'board', x: b.x, y: 1.3, z: b.z + 0.1 })

  // Plants for a bit of life at the lobby edges.
  for (const px of [layout.floor.minX + 1.2, layout.floor.maxX - 1.2]) {
    world.add(box(0.5, 0.5, 0.5, mat('#2a2c33'), px, 0.25, LOBBY_D - 1))
    world.add(box(0.6, 0.7, 0.6, mat('#3f8f6b'), px, 0.85, LOBBY_D - 1))
  }

  world.userData = { desks, seducia, orb, labels }
  return world
}

const projected = new Vector3()
function placeLabels(engine, camera, host) {
  const w = host.clientWidth
  const h = host.clientHeight
  for (const { el, pos } of engine.labelEls) {
    projected.copy(pos).project(camera)
    const visible = projected.z < 1 && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1
    el.style.display = visible ? '' : 'none'
    if (visible) {
      el.style.transform = `translate(-50%, -100%) translate(${((projected.x + 1) / 2) * w}px, ${((1 - projected.y) / 2) * h}px)`
    }
  }
}

function disposeTree(root) {
  root.traverse(obj => {
    obj.geometry?.dispose?.()
    const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
    for (const m of materials) { m.map?.dispose?.(); m.dispose?.() }
  })
}

export default function SushOffice({
  tabs = [],
  states = {},
  limits = {},
  accent = '#ff6b9d',
  reduceMotion = false,
  onOpenSession,
  onNewInProject,
  onChat,
  onAgents
}) {
  const hostRef = useRef(null)
  const engineRef = useRef(null)
  const statesRef = useRef({ states, limits })
  const actionsRef = useRef({})
  const [hint, setHint] = useState(null)
  const [failed, setFailed] = useState(false)

  const layoutKey = officeLayoutKey(tabs)
  const layout = useMemo(() => buildOfficeLayout(tabs), [layoutKey]) // eslint-disable-line react-hooks/exhaustive-deps

  statesRef.current = { states, limits }
  actionsRef.current = { onOpenSession, onNewInProject, onChat, onAgents }

  // Engine: renderer, camera, player, input and the loop. Mounted once.
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
    const labelLayer = document.createElement('div')
    labelLayer.className = 'office-labels'
    host.appendChild(labelLayer)

    const scene = new Scene()
    scene.background = new Color('#08090a')
    scene.fog = new Fog('#08090a', 18, 34)
    scene.add(new HemisphereLight('#c9d2ff', '#1a1210', 1.3))
    const sun = new DirectionalLight('#ffe9f1', 1.6)
    sun.position.set(6, 12, 8)
    scene.add(sun)

    const camera = new PerspectiveCamera(42, 1, 0.1, 80)
    const player = voxelPerson(accent)
    scene.add(player)

    const keys = new Set()
    const engine = {
      renderer, scene, camera, player, keys, world: null, layout: null,
      pos: { x: 0, z: 0 }, facing: 0, walkPhase: 0, dirty: true, nearest: null, labelLayer, labelEls: []
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

    const interact = (target = engine.nearest) => {
      if (!target) return
      const a = actionsRef.current
      if (target.kind === 'session') a.onOpenSession?.(target.tabId)
      else if (target.kind === 'new') a.onNewInProject?.(target.cwd)
      else if (target.kind === 'chat') a.onChat?.()
      else if (target.kind === 'agents') a.onAgents?.()
    }
    const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'])
    const onKeyDown = (e) => {
      const key = e.key.toLowerCase()
      if (MOVE_KEYS.has(key)) { keys.add(key); e.preventDefault() }
      if ((key === 'e' || key === 'enter') && !e.repeat) { e.preventDefault(); interact() }
    }
    const onKeyUp = (e) => keys.delete(e.key.toLowerCase())
    const onBlur = () => keys.clear()
    host.addEventListener('keydown', onKeyDown)
    host.addEventListener('keyup', onKeyUp)
    host.addEventListener('blur', onBlur)

    // Click a desk / Seducia / the board to use it directly.
    const raycaster = new Raycaster()
    const onClick = (e) => {
      host.focus()
      const layoutNow = engine.layout
      if (!layoutNow || !engine.world) return
      const rect = renderer.domElement.getBoundingClientRect()
      const ndc = new Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster.intersectObject(engine.world, true)[0]
      if (!hit) return
      const point = { x: hit.point.x, z: hit.point.z }
      const target = nearestInteractable(point, layoutNow, 1.6)
      if (target) interact(target)
    }
    renderer.domElement.addEventListener('click', onClick)

    let raf = 0
    let timer = 0
    let last = performance.now()
    let lastDraw = 0
    const tmp = new Vector3()

    const frame = (now) => {
      raf = 0
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const hidden = document.visibilityState !== 'visible'
      const layoutNow = engine.layout
      if (!hidden && layoutNow) {
        // ── movement ──
        let mx = 0
        let mz = 0
        if (keys.has('w') || keys.has('arrowup')) mz -= 1
        if (keys.has('s') || keys.has('arrowdown')) mz += 1
        if (keys.has('a') || keys.has('arrowleft')) mx -= 1
        if (keys.has('d') || keys.has('arrowright')) mx += 1
        const moving = mx || mz
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
        p.legL.rotation.x = swing
        p.legR.rotation.x = -swing
        p.armL.rotation.x = -swing
        p.armR.rotation.x = swing
        player.position.set(engine.pos.x, 0, engine.pos.z)
        player.rotation.y += ((engine.facing - player.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 12)

        // ── camera follows from behind-above ──
        tmp.set(engine.pos.x, 7.2, engine.pos.z + 8.4)
        camera.position.lerp(tmp, moving ? Math.min(1, dt * 5) : 1)
        camera.lookAt(engine.pos.x, 0.8, engine.pos.z - 1.4)

        // ── agents reflect live state ──
        const { states: live, limits: lim } = statesRef.current
        const t = now / 1000
        for (const group of engine.world?.userData.desks || []) {
          const { desk, screenMat, person, badge } = group.userData
          if (!desk.tabId) continue
          const id = lim[desk.tabId] ? 'limit' : (live[desk.tabId] || 'idle')
          const color = id === 'limit' ? '#ff9f43' : (STATES[id]?.color || STATES.idle.color)
          if (screenMat.color.getHexString() !== color.slice(1)) { screenMat.color.set(color); engine.dirty = true }
          if (badge) {
            const show = id === 'waiting' || id === 'error' || id === 'limit'
            if (badge.visible !== show) { badge.visible = show; engine.dirty = true }
          }
          if (person && !reduceMotion) {
            const parts = person.userData.parts
            const typing = id === 'working'
            parts.armL.rotation.x = typing ? -1.1 + Math.sin(t * 18 + desk.x) * 0.25 : -0.9
            parts.armR.rotation.x = typing ? -1.1 + Math.cos(t * 18 + desk.z) * 0.25 : -0.9
            parts.armR.rotation.z = id === 'waiting' ? 2.6 : 0   // hand up: needs you
            parts.head.rotation.x = id === 'limit' ? 0.5 : id === 'error' ? -0.2 : Math.sin(t * 1.3 + desk.x) * 0.05
            if (badge?.visible) badge.position.y = 2.45 + Math.sin(t * 4) * 0.06
          }
        }
        const orb = engine.world?.userData.orb
        if (orb && !reduceMotion) { orb.rotation.y = t; orb.position.y = 1.2 + Math.sin(t * 2) * 0.08 }

        // ── what's in reach ──
        const near = nearestInteractable(engine.pos, layoutNow)
        if ((near?.id || null) !== (engine.nearest?.id || null)) {
          engine.nearest = near
          setHint(near ? { label: near.label, kind: near.kind } : null)
        }

        const ambient = !reduceMotion && now - lastDraw > 1000 / IDLE_FPS
        if (engine.dirty || moving || ambient) {
          renderer.render(scene, camera)
          placeLabels(engine, camera, host)
          lastDraw = now
          engine.dirty = false
        }
      }
      // Hidden window or idle under reduce-motion: poll slowly instead of
      // spinning requestAnimationFrame at display rate.
      const active = keys.size > 0
      if (hidden) timer = setTimeout(() => { raf = requestAnimationFrame(frame) }, 500)
      else if (active || !reduceMotion) raf = requestAnimationFrame(frame)
      else timer = setTimeout(() => { raf = requestAnimationFrame(frame) }, 200)
    }
    engine.kick = () => { if (!raf) { clearTimeout(timer); raf = requestAnimationFrame(frame) } }
    host.addEventListener('keydown', engine.kick)
    raf = requestAnimationFrame(frame)
    host.focus()

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      observer.disconnect()
      host.removeEventListener('keydown', onKeyDown)
      host.removeEventListener('keydown', engine.kick)
      host.removeEventListener('keyup', onKeyUp)
      host.removeEventListener('blur', onBlur)
      renderer.domElement.removeEventListener('click', onClick)
      disposeTree(scene)
      renderer.dispose()
      renderer.domElement.remove()
      labelLayer.remove()
      engineRef.current = null
    }
  }, [accent, reduceMotion])

  // World: rebuilt when sessions/projects change; the player keeps its spot.
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (engine.world) { engine.scene.remove(engine.world); disposeTree(engine.world) }
    engine.world = buildWorld(layout, accent)
    engine.scene.add(engine.world)
    engine.labelLayer.replaceChildren()
    engine.labelEls = engine.world.userData.labels.map(label => {
      const el = document.createElement('div')
      el.className = `office-label is-${label.kind}`
      el.textContent = label.text
      engine.labelLayer.appendChild(el)
      return { el, pos: new Vector3(label.x, label.y, label.z) }
    })
    const first = !engine.layout
    engine.layout = layout
    if (first) engine.pos = { ...layout.spawn }
    else engine.pos = moveWithCollisions(engine.pos, 0, 0, layout.colliders)
    engine.dirty = true
    engine.kick?.()
  }, [layout, accent, reduceMotion])

  const counts = useMemo(() => {
    let working = 0
    let waiting = 0
    for (const tab of tabs) {
      if (states[tab.id] === 'working') working++
      if (states[tab.id] === 'waiting' || limits[tab.id]) waiting++
    }
    return { working, waiting }
  }, [tabs, states, limits])

  if (failed) {
    return (
      <div className="office-fallback">
        <strong>The office needs WebGL.</strong>
        <span>Your GPU or power settings blocked it. Every agent is still in the sidebar and in Agents.</span>
      </div>
    )
  }

  return (
    <div className="office">
      <div ref={hostRef} className="office-host" tabIndex={0} aria-label="Sush Office. Move with W A S D or the arrow keys, press E to interact." />
      <div className="office-hud">
        <span><b>{tabs.length}</b> agent{tabs.length === 1 ? '' : 's'}</span>
        <span><b>{counts.working}</b> working</span>
        {counts.waiting > 0 && <span className="is-waiting"><b>{counts.waiting}</b> need you</span>}
        <span className="office-keys">WASD move · Shift run · E interact · click a desk</span>
      </div>
      {hint && (
        <div className={`office-hint is-${hint.kind}`}>
          <kbd>E</kbd> {hint.kind === 'session' ? `Open ${hint.label}` : hint.label}
        </div>
      )}
    </div>
  )
}
