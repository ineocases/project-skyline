import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, PointerEvent } from 'react'

type LayoutId = 'vertical' | 'split' | 'trio' | 'spotlight' | 'centered' | 'horizontal' | 'grid'
type FitMode = 'cover' | 'contain'
type BackgroundMode = 'black' | 'white' | 'color' | 'blur'
type AudioMode = 'mix' | 'selected' | 'mute'
type Slot = {
  id: string
  clipId: string
  x: number
  y: number
  width: number
  height: number
  scale: number
  offsetX: number
  offsetY: number
  fit: FitMode
  border: number
  muted: boolean
}
type Clip = {
  id: string
  name: string
  url: string
  duration: number
  trimStart: number
  trimEnd: number
}

type Point = { x: number; y: number }

const LAYOUTS: Record<LayoutId, { label: string; slots: Array<Omit<Slot, 'id' | 'clipId' | 'scale' | 'offsetX' | 'offsetY' | 'fit' | 'border' | 'muted'>> }> = {
  vertical: {
    label: 'Vertical',
    slots: [
      { x: 0, y: 0, width: 50, height: 100 },
      { x: 50, y: 0, width: 50, height: 100 },
    ],
  },
  split: {
    label: 'Dividido',
    slots: [
      { x: 0, y: 0, width: 50, height: 100 },
      { x: 50, y: 0, width: 50, height: 100 },
    ],
  },
  trio: {
    label: 'Trío',
    slots: [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 50, width: 50, height: 50 },
      { x: 50, y: 50, width: 50, height: 50 },
    ],
  },
  spotlight: {
    label: 'Spotlight',
    slots: [
      { x: 14, y: 8, width: 72, height: 84 },
      { x: 67, y: 65, width: 27, height: 27 },
    ],
  },
  centered: {
    label: 'Centrado',
    slots: [{ x: 23, y: 8, width: 54, height: 84 }],
  },
  horizontal: {
    label: 'Horizontal',
    slots: [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 50, width: 100, height: 50 },
    ],
  },
  grid: {
    label: 'Grid 2×2',
    slots: [
      { x: 0, y: 0, width: 50, height: 50 },
      { x: 50, y: 0, width: 50, height: 50 },
      { x: 0, y: 50, width: 50, height: 50 },
      { x: 50, y: 50, width: 50, height: 50 },
    ],
  },
}

const palette = ['#11a7c7', '#a56cff', '#f4a62a', '#39c27f', '#ed5b6d', '#f05ee7', '#77d8ff', '#d4e157']

function createSlot(index: number, template: (typeof LAYOUTS)[LayoutId]['slots'][number], clipId: string): Slot {
  return {
    id: `slot-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    clipId,
    ...template,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    fit: 'cover',
    border: 0,
    muted: false,
  }
}

function makeSlots(layout: LayoutId, clipIds: string[]) {
  return LAYOUTS[layout].slots.map((template, index) => createSlot(index, template, clipIds[index] ?? clipIds[0] ?? ''))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function formatTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0)
  const minutes = Math.floor(safe / 60)
  const secs = Math.floor(safe % 60)
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

function drawCover(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, width: number, height: number, fit: FitMode, scale: number, offsetX: number, offsetY: number) {
  if (video.videoWidth === 0 || video.videoHeight === 0) return
  const sourceRatio = video.videoWidth / video.videoHeight
  const targetRatio = width / height
  let drawWidth: number
  let drawHeight: number
  if (fit === 'contain') {
    if (sourceRatio > targetRatio) {
      drawWidth = width
      drawHeight = width / sourceRatio
    } else {
      drawHeight = height
      drawWidth = height * sourceRatio
    }
  } else if (sourceRatio > targetRatio) {
    drawHeight = height
    drawWidth = height * sourceRatio
  } else {
    drawWidth = width
    drawHeight = width / sourceRatio
  }
  drawWidth *= scale
  drawHeight *= scale
  const drawX = x + (width - drawWidth) / 2 + offsetX * width
  const drawY = y + (height - drawHeight) / 2 + offsetY * height
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, width, height)
  ctx.clip()
  ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight)
  ctx.restore()
}

export function CompositionEditor() {
  const [clips, setClips] = useState<Clip[]>([])
  const [layout, setLayout] = useState<LayoutId>('split')
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [aspect, setAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16')
  const [backgroundMode, setBackgroundMode] = useState<BackgroundMode>('black')
  const [backgroundColor, setBackgroundColor] = useState('#080a0d')
  const [audioMode, setAudioMode] = useState<AudioMode>('mix')
  const [audioSlotId, setAudioSlotId] = useState<string | null>(null)
  const [showSubtitles, setShowSubtitles] = useState(false)
  const [subtitleText, setSubtitleText] = useState('Subtítulos automáticos')
  const [showWatermark, setShowWatermark] = useState(false)
  const [watermarkText, setWatermarkText] = useState('Tu marca')
  const [showBorders, setShowBorders] = useState(false)
  const [borderWidth, setBorderWidth] = useState(4)
  const [syncLongest, setSyncLongest] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState('Agregá 2 o más videos para comenzar.')
  const [freeform, setFreeform] = useState(false)
  const [dragState, setDragState] = useState<{ slotId: string; mode: 'move' | 'resize'; start: Point; initial: Slot } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const audioSourcesRef = useRef<Record<string, MediaElementAudioSourceNode>>({})
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})
  const animationRef = useRef<number | null>(null)
  const playStartedAt = useRef(0)
  const playBaseTime = useRef(0)

  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId) ?? null
  const selectedClip = clips.find((clip) => clip.id === selectedSlot?.clipId) ?? null

  const projectDuration = useMemo(() => {
    if (!clips.length) return 0
    const durations = clips.map((clip) => Math.max(0, clip.trimEnd - clip.trimStart)).filter((value) => value > 0)
    return syncLongest ? Math.max(0, ...durations) : Math.min(...durations)
  }, [clips, syncLongest])

  const canvasSize = useMemo(() => {
    if (aspect === '16:9') return { width: 960, height: 540 }
    if (aspect === '1:1') return { width: 720, height: 720 }
    return { width: 540, height: 960 }
  }, [aspect])

  const updateSlot = useCallback((id: string, patch: Partial<Slot>) => {
    setSlots((current) => current.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)))
  }, [])

  const loadFiles = useCallback((files: File[]) => {
    const videoFiles = files.filter((file) => file.type.startsWith('video/'))
    if (!videoFiles.length) {
      setStatus('Solo se aceptan archivos de video.')
      return
    }
    const newClips = videoFiles.map((file, index) => ({
      id: `clip-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      url: URL.createObjectURL(file),
      duration: 0,
      trimStart: 0,
      trimEnd: 0,
    }))
    setClips((current) => [...current, ...newClips])
    setStatus(`${videoFiles.length} video${videoFiles.length > 1 ? 's' : ''} agregado${videoFiles.length > 1 ? 's' : ''}.`)
  }, [])

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    loadFiles(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const applyLayout = (nextLayout: LayoutId) => {
    setLayout(nextLayout)
    setFreeform(false)
    const ids = clips.map((clip) => clip.id)
    const nextSlots = makeSlots(nextLayout, ids)
    setSlots(nextSlots)
    setSelectedSlotId(nextSlots[0]?.id ?? null)
    setStatus(`${LAYOUTS[nextLayout].label} aplicado.`)
  }

  const addSlot = () => {
    const clipId = clips[0]?.id
    if (!clipId) {
      setStatus('Agregá un video antes de crear una posición.')
      return
    }
    const newSlot = createSlot(slots.length, { x: 20, y: 20, width: 60, height: 60 }, clipId)
    setSlots((current) => [...current, newSlot])
    setSelectedSlotId(newSlot.id)
    setFreeform(true)
    setStatus('Nueva posición agregada.')
  }

  const removeSlot = (id: string) => {
    setSlots((current) => current.filter((slot) => slot.id !== id))
    setSelectedSlotId((current) => (current === id ? null : current))
  }

  const replaceSlotClip = (clipId: string) => {
    if (!selectedSlotId) return
    updateSlot(selectedSlotId, { clipId })
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, slot: Slot, mode: 'move' | 'resize') => {
    event.preventDefault()
    event.stopPropagation()
    setSelectedSlotId(slot.id)
    setDragState({ slotId: slot.id, mode, start: { x: event.clientX, y: event.clientY }, initial: { ...slot } })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  useEffect(() => {
    if (!dragState || !stageRef.current) return
    const handleMove = (event: PointerEvent) => {
      const rect = stageRef.current?.getBoundingClientRect()
      if (!rect) return
      const dx = ((event.clientX - dragState.start.x) / rect.width) * 100
      const dy = ((event.clientY - dragState.start.y) / rect.height) * 100
      const initial = dragState.initial
      if (dragState.mode === 'move') {
        updateSlot(dragState.slotId, {
          x: clamp(initial.x + dx, 0, 100 - initial.width),
          y: clamp(initial.y + dy, 0, 100 - initial.height),
        })
      } else {
        updateSlot(dragState.slotId, {
          width: clamp(initial.width + dx, 8, 100 - initial.x),
          height: clamp(initial.height + dy, 8, 100 - initial.y),
        })
      }
    }
    const handleUp = () => setDragState(null)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [dragState, updateSlot])

  useEffect(() => {
    if (!clips.length) return
    const missing = clips.some((clip) => clip.duration === 0)
    if (!missing) {
      if (!slots.length) {
        const nextSlots = makeSlots(layout, clips.map((clip) => clip.id))
        setSlots(nextSlots)
        setSelectedSlotId(nextSlots[0]?.id ?? null)
      }
      return
    }
  }, [clips, layout, slots.length])

  const handleVideoMetadata = (clipId: string, duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return
    setClips((current) => current.map((clip) => clip.id === clipId ? { ...clip, duration, trimEnd: clip.trimEnd > 0 ? Math.min(clip.trimEnd, duration) : duration } : clip))
  }

  const syncVideos = useCallback((time: number) => {
    clips.forEach((clip) => {
      const video = videoRefs.current[clip.id]
      if (!video || !Number.isFinite(video.duration)) return
      const localDuration = Math.max(0.001, clip.trimEnd - clip.trimStart)
      const local = syncLongest ? time % localDuration : Math.min(time, Math.max(0, localDuration - 0.001))
      const target = clip.trimStart + local
      if (Math.abs(video.currentTime - target) > 0.08) video.currentTime = target
    })
  }, [clips, syncLongest])

  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    if (backgroundMode === 'color') ctx.fillStyle = backgroundColor
    else if (backgroundMode === 'white') ctx.fillStyle = '#ffffff'
    else ctx.fillStyle = '#050608'
    ctx.fillRect(0, 0, width, height)

    if (backgroundMode === 'blur' && clips[0]) {
      const video = videoRefs.current[clips[0].id]
      if (video && video.videoWidth) {
        ctx.save()
        ctx.filter = 'blur(30px) brightness(.55)'
        ctx.drawImage(video, -width * 0.08, -height * 0.08, width * 1.16, height * 1.16)
        ctx.restore()
      }
    }

    slots.forEach((slot, index) => {
      const clip = clips.find((item) => item.id === slot.clipId)
      const video = clip ? videoRefs.current[clip.id] : null
      if (!video) return
      const x = (slot.x / 100) * width
      const y = (slot.y / 100) * height
      const w = (slot.width / 100) * width
      const h = (slot.height / 100) * height
      drawCover(ctx, video, x, y, w, h, slot.fit, slot.scale, slot.offsetX, slot.offsetY)
      if (showBorders || slot.border > 0) {
        ctx.strokeStyle = '#0b0c10'
        ctx.lineWidth = (showBorders ? borderWidth : slot.border) * (width / 540)
        ctx.strokeRect(x, y, w, h)
      }
      if (index === 0 && showWatermark) {
        ctx.font = `${Math.max(13, width * 0.02)}px Inter, sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.globalAlpha = 0.9
        ctx.textAlign = 'right'
        ctx.fillText(watermarkText, width - width * 0.035, height - height * 0.03)
        ctx.globalAlpha = 1
      }
    })
    if (showSubtitles && subtitleText.trim()) {
      ctx.font = `700 ${Math.max(18, width * 0.034)}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.lineWidth = Math.max(3, width * 0.006)
      ctx.strokeStyle = 'rgba(0,0,0,.85)'
      ctx.strokeText(subtitleText, width / 2, height - height * 0.055)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(subtitleText, width / 2, height - height * 0.055)
    }
  }, [backgroundColor, backgroundMode, borderWidth, clips, slots, showBorders, showSubtitles, showWatermark, subtitleText, watermarkText])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width = canvasSize.width
    canvas.height = canvasSize.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawFrame(ctx, canvas.width, canvas.height)
    const preview = previewCanvasRef.current
    if (preview) {
      preview.width = canvas.width
      preview.height = canvas.height
      const previewCtx = preview.getContext('2d')
      if (previewCtx) previewCtx.drawImage(canvas, 0, 0, preview.width, preview.height)
    }
  }, [canvasSize, drawFrame, currentTime])

  const stopPlayback = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    animationRef.current = null
    clips.forEach((clip) => videoRefs.current[clip.id]?.pause())
    setIsPlaying(false)
  }, [clips])

  const startPlayback = useCallback(() => {
    if (!clips.length || !projectDuration) return
    setIsPlaying(true)
    playStartedAt.current = performance.now()
    playBaseTime.current = currentTime
    clips.forEach((clip) => {
      const video = videoRefs.current[clip.id]
      if (video) video.play().catch(() => undefined)
    })
    const tick = () => {
      const elapsed = (performance.now() - playStartedAt.current) / 1000
      const nextTime = playBaseTime.current + elapsed
      if (nextTime >= projectDuration) {
        setCurrentTime(projectDuration)
        stopPlayback()
        return
      }
      setCurrentTime(nextTime)
      syncVideos(nextTime)
      animationRef.current = requestAnimationFrame(tick)
    }
    animationRef.current = requestAnimationFrame(tick)
  }, [clips, currentTime, projectDuration, stopPlayback, syncVideos])

  useEffect(() => () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    clips.forEach((clip) => URL.revokeObjectURL(clip.url))
    (Object.values(audioSourcesRef.current) as MediaElementAudioSourceNode[]).forEach((source) => source.disconnect())
    audioContextRef.current?.close().catch(() => undefined)
  }, [])

  const togglePlayback = () => {
    if (isPlaying) stopPlayback()
    else startPlayback()
  }

  const exportVideo = async () => {
    const canvas = canvasRef.current
    if (!canvas || !clips.length) {
      setStatus('Agregá videos antes de exportar.')
      return
    }
    if (!('MediaRecorder' in window) || !canvas.captureStream) {
      setStatus('Este navegador no soporta exportación directa. Probá Chrome o Edge.')
      return
    }
    setIsExporting(true)
    stopPlayback()
    setStatus('Procesando video…')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const canvasStream = canvas.captureStream(30)
    let audioContext: AudioContext | null = null
    let destination: MediaStreamAudioDestinationNode | null = null
    const sources: MediaElementAudioSourceNode[] = []
    try {
      if (audioMode !== 'mute') {
        audioContext = audioContextRef.current ?? new AudioContext()
        audioContextRef.current = audioContext
        destination = audioDestinationRef.current ?? audioContext.createMediaStreamDestination()
        audioDestinationRef.current = destination
        for (const clip of clips) {
          const video = videoRefs.current[clip.id]
          if (!video) continue
          if (audioMode === 'selected' && clip.id !== audioSlotId) continue
          let source = audioSourcesRef.current[clip.id]
          if (!source) {
            source = audioContext.createMediaElementSource(video)
            audioSourcesRef.current[clip.id] = source
          }
          source.connect(destination)
          sources.push(source)
        }
        await audioContext.resume()
      }
      const tracks = [...canvasStream.getVideoTracks()]
      if (destination) tracks.push(...destination.stream.getAudioTracks())
      const stream = new MediaStream(tracks)
      const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm'
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 7_000_000 })
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve() })
      recorder.start(200)
      const started = performance.now()
      const renderExport = () => {
        const elapsed = (performance.now() - started) / 1000
        if (elapsed >= projectDuration) {
          syncVideos(projectDuration)
          drawFrame(ctx, canvas.width, canvas.height)
          recorder.stop()
          return
        }
        syncVideos(elapsed)
        drawFrame(ctx, canvas.width, canvas.height)
        requestAnimationFrame(renderExport)
      }
      renderExport()
      await done
      const blob = new Blob(chunks, { type: mime })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `opencut-${layout}-${Date.now()}.webm`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setStatus('Exportación terminada.')
    } catch (error) {
      console.error(error)
      setStatus('No se pudo exportar. Probá Chrome/Edge y archivos locales.')
    } finally {
      sources.forEach((source) => { try { source.disconnect() } catch { /* already disconnected */ } })
      setIsExporting(false)
    }
  }

  const resetProject = () => {
    stopPlayback()
    clips.forEach((clip) => URL.revokeObjectURL(clip.url))
    setClips([])
    setSlots([])
    setSelectedSlotId(null)
    setCurrentTime(0)
    setStatus('Proyecto reiniciado.')
  }

  const saveProject = () => {
    const data = { version: 1, layout, aspect, slots, backgroundMode, backgroundColor, audioMode, audioSlotId, showSubtitles, subtitleText, showWatermark, watermarkText, showBorders, borderWidth, syncLongest }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'opencut-composition-project.json'
    link.click()
    URL.revokeObjectURL(url)
    setStatus('Configuración guardada como JSON.')
  }

  const duplicateSelected = () => {
    if (!selectedSlot) return
    const copy = { ...selectedSlot, id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, x: clamp(selectedSlot.x + 4, 0, 100 - selectedSlot.width), y: clamp(selectedSlot.y + 4, 0, 100 - selectedSlot.height) }
    setSlots((current) => [...current, copy])
    setSelectedSlotId(copy.id)
    setFreeform(true)
  }

  return (
    <main className="composition-app">
      <header className="composition-header">
        <div>
          <div className="brand-line"><span className="brand-dot" /> OpenCut <span className="brand-pill">Composition</span></div>
          <h1>Posicioná el recorte</h1>
          <p>Arrastrá cada panel para posicionarlo. Usá la esquina para redimensionar y ajustá el recorte individualmente.</p>
        </div>
        <div className="header-actions">
          <button className="ghost-button" onClick={saveProject}>Guardar proyecto</button>
          <button className="primary-button" onClick={exportVideo} disabled={isExporting || !clips.length}>{isExporting ? 'Procesando…' : 'Exportar WebM'}</button>
        </div>
      </header>

      <section className="layout-toolbar">
        {(Object.keys(LAYOUTS) as LayoutId[]).map((id) => (
          <button key={id} className={layout === id && !freeform ? 'layout-button active' : 'layout-button'} onClick={() => applyLayout(id)}>{LAYOUTS[id].label}</button>
        ))}
        <button className={freeform ? 'layout-button active' : 'layout-button'} onClick={() => setFreeform(true)}>Libre</button>
      </section>

      <div className="composition-body">
        <section className="editor-panel">
          <div className="stage-toolbar">
            <div className="toolbar-group">
              <span>Formato</span>
              {(['9:16', '16:9', '1:1'] as const).map((value) => <button key={value} className={aspect === value ? 'mini-button active' : 'mini-button'} onClick={() => setAspect(value)}>{value}</button>)}
            </div>
            <div className="toolbar-group">
              <span>Duración</span>
              <button className={syncLongest ? 'mini-button active' : 'mini-button'} onClick={() => setSyncLongest(!syncLongest)}>{syncLongest ? 'Más largo' : 'Más corto'}</button>
            </div>
            <button className="info-button" title="Seleccioná un panel y arrastralo dentro del lienzo">i</button>
          </div>

          <div className="stage-wrap">
            <div ref={stageRef} className="stage" style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}>
              <canvas ref={canvasRef} className="export-canvas" />
              {clips.map((clip) => (
                <video
                  key={clip.id}
                  ref={(element) => { videoRefs.current[clip.id] = element }}
                  src={clip.url}
                  preload="metadata"
                  muted
                  playsInline
                  onLoadedMetadata={(event) => handleVideoMetadata(clip.id, event.currentTarget.duration)}
                  className="source-video"
                />
              ))}
              {slots.map((slot, index) => {
                const clip = clips.find((item) => item.id === slot.clipId)
                return (
                  <div
                    key={slot.id}
                    className={selectedSlotId === slot.id ? 'slot-overlay selected' : 'slot-overlay'}
                    style={{ left: `${slot.x}%`, top: `${slot.y}%`, width: `${slot.width}%`, height: `${slot.height}%` }}
                    onPointerDown={(event) => onPointerDown(event, slot, 'move')}
                    onClick={() => setSelectedSlotId(slot.id)}
                  >
                    <span className="slot-label">{clip?.name ?? `Video ${index + 1}`}</span>
                    <span className="slot-number">{index + 1}</span>
                    {selectedSlotId === slot.id && <button className="resize-handle" aria-label="Redimensionar" onPointerDown={(event) => onPointerDown(event, slot, 'resize')} />}
                  </div>
                )
              })}
              {!clips.length && <div className="empty-stage"><strong>Tu composición aparece acá</strong><span>Subí dos o más videos para empezar</span><button className="primary-button" onClick={() => fileInputRef.current?.click()}>Agregar videos</button></div>}
            </div>
          </div>

          <div className="transport">
            <button className="transport-button" onClick={() => setCurrentTime(Math.max(0, currentTime - 1))}>‹</button>
            <button className="play-button" onClick={togglePlayback}>{isPlaying ? 'Ⅱ' : '▶'}</button>
            <button className="transport-button" onClick={() => setCurrentTime(Math.min(projectDuration, currentTime + 1))}>›</button>
            <span className="timecode">{formatTime(currentTime)} / {formatTime(projectDuration)}</span>
            <input className="timeline-range" type="range" min="0" max={Math.max(projectDuration, 0.01)} step="0.01" value={Math.min(currentTime, projectDuration)} onChange={(event) => { stopPlayback(); setCurrentTime(Number(event.target.value)); syncVideos(Number(event.target.value)) }} />
            <span className="speed">1×</span>
          </div>
        </section>

        <aside className="sidebar">
          <div className="card positions-card">
            <div className="card-title"><h2>Posiciones del recorte</h2><span>{slots.length}</span></div>
            <div className="positions-list">
              {slots.length ? slots.map((slot, index) => {
                const clip = clips.find((item) => item.id === slot.clipId)
                return <button key={slot.id} className={selectedSlotId === slot.id ? 'position-row active' : 'position-row'} onClick={() => setSelectedSlotId(slot.id)}><i style={{ background: palette[index % palette.length] }} /><div><strong>{index + 1}. {clip?.name ?? 'Sin video'}</strong><small>{Math.round(slot.x)}%, {Math.round(slot.y)}% · {Math.round(slot.width)}×{Math.round(slot.height)}%</small></div><span>›</span></button>
              }) : <div className="empty-list">No hay posiciones.</div>}
            </div>
          </div>

          <div className="card preview-card">
            <div className="card-title"><h2>Vista previa ({aspect})</h2><span className="live-dot">●</span></div>
            <div className="phone-preview" style={{ aspectRatio: `${canvasSize.width} / ${canvasSize.height}` }}>
              <canvas ref={previewCanvasRef} width={canvasSize.width} height={canvasSize.height} />
            </div>
            <div className="preview-hint">El lienzo de exportación respeta estas posiciones.</div>
          </div>

          <div className="card controls-card">
            <div className="control-row"><div><strong>Subtítulos automáticos</strong><small>Texto sobre el video</small></div><button className={showSubtitles ? 'switch on' : 'switch'} onClick={() => setShowSubtitles(!showSubtitles)}><span /></button></div>
            {showSubtitles && <input className="text-input" value={subtitleText} onChange={(event) => setSubtitleText(event.target.value)} placeholder="Texto de subtítulo" />}
            <div className="control-row"><div><strong>Tu marca</strong><small>Marca de agua en el render</small></div><button className={showWatermark ? 'switch on' : 'switch'} onClick={() => setShowWatermark(!showWatermark)}><span /></button></div>
            {showWatermark && <input className="text-input" value={watermarkText} onChange={(event) => setWatermarkText(event.target.value)} placeholder="Tu marca" />}
            <div className="control-row"><div><strong>Bordes / separadores</strong><small>{borderWidth}px</small></div><button className={showBorders ? 'switch on' : 'switch'} onClick={() => setShowBorders(!showBorders)}><span /></button></div>
            {showBorders && <input className="range-control" type="range" min="1" max="20" value={borderWidth} onChange={(event) => setBorderWidth(Number(event.target.value))} />}
            <div className="control-block"><label>Fondo</label><select value={backgroundMode} onChange={(event) => setBackgroundMode(event.target.value as BackgroundMode)}><option value="black">Negro</option><option value="white">Blanco</option><option value="color">Color</option><option value="blur">Blur del video</option></select>{backgroundMode === 'color' && <input className="color-input" type="color" value={backgroundColor} onChange={(event) => setBackgroundColor(event.target.value)} />}</div>
            <div className="control-block"><label>Audio</label><select value={audioMode} onChange={(event) => setAudioMode(event.target.value as AudioMode)}><option value="mix">Mezclar todos</option><option value="selected">Solo seleccionado</option><option value="mute">Silenciar</option></select>{audioMode === 'selected' && <select value={audioSlotId ?? ''} onChange={(event) => setAudioSlotId(event.target.value)}><option value="">Elegí un video</option>{clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}</select>}</div>
          </div>

          {selectedSlot && <div className="card inspector-card">
            <div className="card-title"><h2>Editar posición</h2><button className="tiny-danger" onClick={() => removeSlot(selectedSlot.id)}>Eliminar</button></div>
            <label>Video</label>
            <select value={selectedSlot.clipId} onChange={(event) => replaceSlotClip(event.target.value)}>{clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.name}</option>)}</select>
            <div className="two-cols"><div><label>X</label><input type="number" value={Math.round(selectedSlot.x)} onChange={(event) => updateSlot(selectedSlot.id, { x: clamp(Number(event.target.value), 0, 100 - selectedSlot.width) })} /></div><div><label>Y</label><input type="number" value={Math.round(selectedSlot.y)} onChange={(event) => updateSlot(selectedSlot.id, { y: clamp(Number(event.target.value), 0, 100 - selectedSlot.height) })} /></div></div>
            <div className="two-cols"><div><label>Ancho</label><input type="number" value={Math.round(selectedSlot.width)} onChange={(event) => updateSlot(selectedSlot.id, { width: clamp(Number(event.target.value), 8, 100 - selectedSlot.x) })} /></div><div><label>Alto</label><input type="number" value={Math.round(selectedSlot.height)} onChange={(event) => updateSlot(selectedSlot.id, { height: clamp(Number(event.target.value), 8, 100 - selectedSlot.y) })} /></div></div>
            <label>Modo de ajuste</label><select value={selectedSlot.fit} onChange={(event) => updateSlot(selectedSlot.id, { fit: event.target.value as FitMode })}><option value="cover">Recortar · Cover</option><option value="contain">Ajustar · Fit</option></select>
            <label>Zoom · {selectedSlot.scale.toFixed(2)}×</label><input className="range-control" type="range" min="0.5" max="4" step="0.01" value={selectedSlot.scale} onChange={(event) => updateSlot(selectedSlot.id, { scale: Number(event.target.value) })} />
            <label>Desplazamiento X · {selectedSlot.offsetX.toFixed(2)}</label><input className="range-control" type="range" min="-1" max="1" step="0.01" value={selectedSlot.offsetX} onChange={(event) => updateSlot(selectedSlot.id, { offsetX: Number(event.target.value) })} />
            <label>Desplazamiento Y · {selectedSlot.offsetY.toFixed(2)}</label><input className="range-control" type="range" min="-1" max="1" step="0.01" value={selectedSlot.offsetY} onChange={(event) => updateSlot(selectedSlot.id, { offsetY: Number(event.target.value) })} />
            {selectedClip && <><label>Recorte temporal · {formatTime(selectedClip.trimStart)} → {formatTime(selectedClip.trimEnd)}</label><div className="two-cols"><input type="number" min="0" max={selectedClip.duration} step="0.1" value={selectedClip.trimStart} onChange={(event) => setClips((current) => current.map((clip) => clip.id === selectedClip.id ? { ...clip, trimStart: clamp(Number(event.target.value), 0, Math.max(0, clip.trimEnd - 0.1)) } : clip))} /><input type="number" min="0.1" max={selectedClip.duration} step="0.1" value={selectedClip.trimEnd} onChange={(event) => setClips((current) => current.map((clip) => clip.id === selectedClip.id ? { ...clip, trimEnd: clamp(Number(event.target.value), clip.trimStart + 0.1, clip.duration || Number(event.target.value)) } : clip))} /></div></>}
            <div className="inspector-actions"><button className="ghost-button" onClick={duplicateSelected}>Duplicar</button><button className={selectedSlot.muted ? 'ghost-button active' : 'ghost-button'} onClick={() => updateSlot(selectedSlot.id, { muted: !selectedSlot.muted })}>{selectedSlot.muted ? 'Silenciado' : 'Audio activo'}</button></div>
          </div>}
        </aside>
      </div>

      <footer className="bottom-bar">
        <div className="media-actions"><button className="ghost-button" onClick={() => fileInputRef.current?.click()}>+ Agregar videos</button><button className="ghost-button" onClick={addSlot}>+ Nueva posición</button><button className="ghost-button" onClick={resetProject}>Reiniciar</button></div>
        <div className="status-text">{status}</div>
        <div className="export-actions"><button className="primary-button" onClick={exportVideo} disabled={isExporting || !clips.length}>{isExporting ? 'Procesando…' : 'Procesar composición'}</button></div>
      </footer>
      <input ref={fileInputRef} hidden type="file" accept="video/*" multiple onChange={handleFileInput} />
    </main>
  )
}
