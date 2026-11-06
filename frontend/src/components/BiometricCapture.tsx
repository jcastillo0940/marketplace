import { useCallback, useEffect, useRef, useState } from 'react'
import { submitBiometricCheck } from '../api/client'
import { CHALLENGE_INSTRUCTIONS, createChallengeTracker, eyeAspectRatio, isFacingCamera, shuffledChallenges, yawRatio } from './biometricLiveness'
import type { LivenessChallenge } from './biometricLiveness'

type FaceApi = typeof import('@vladmandic/face-api')
type Step = 'consent' | 'cedula' | 'selfie' | 'sending'

const MODEL_URL = '/models/face'
const SCAN_INTERVAL_MS = 160
const CHALLENGE_TIMEOUT_MS = 60_000

let faceApiPromise: Promise<FaceApi> | null = null

function loadFaceApi(): Promise<FaceApi> {
  faceApiPromise ??= (async () => {
    const faceapi = await import('@vladmandic/face-api')
    // The library defaults to a WASM backend whose files are not shipped.
    const tf = faceapi.tf as unknown as { setBackend(name: string): Promise<boolean>; ready(): Promise<void> }
    const usingGpu = await tf.setBackend('webgl').catch(() => false)
    if (!usingGpu) await tf.setBackend('cpu')
    await tf.ready()
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    return faceapi
  })().catch((error: unknown) => {
    faceApiPromise = null
    throw error
  })
  return faceApiPromise
}

function detectorOptions(faceapi: FaceApi, inputSize: number) {
  return new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.4 })
}

function grabFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')?.drawImage(video, 0, 0)
  return canvas
}

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error('No pudimos procesar la foto.')) }, 'image/jpeg', 0.9)
  })
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'No tenemos permiso para usar la cámara. Actívalo en tu navegador e inténtalo de nuevo.'
  if (name === 'NotFoundError') return 'No encontramos una cámara en este dispositivo.'
  return 'No pudimos abrir la cámara. Inténtalo de nuevo.'
}

export default function BiometricCapture({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [step, setStep] = useState<Step>('consent')
  const [consent, setConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [instruction, setInstruction] = useState('')
  const [challenges] = useState<LivenessChallenge[]>(() => shuffledChallenges())
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const cedulaRef = useRef<{ blob: Blob; descriptor: Float32Array } | null>(null)

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const startCamera = useCallback(async (facingMode: 'user' | 'environment') => {
    stopCamera()
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } })
    streamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play()
    }
  }, [stopCamera])

  useEffect(() => {
    if (step !== 'cedula') return
    setError('')
    startCamera('environment').catch((failure: unknown) => setError(cameraErrorMessage(failure)))
  }, [step, startCamera])

  useEffect(() => {
    if (step !== 'selfie') return
    let active = true
    let timer: number | undefined
    const tracker = createChallengeTracker(challenges)
    const deadline = Date.now() + CHALLENGE_TIMEOUT_MS

    async function finish(faceapi: FaceApi, video: HTMLVideoElement) {
      const frame = grabFrame(video)
      const face = await faceapi.detectSingleFace(frame, detectorOptions(faceapi, 416)).withFaceLandmarks().withFaceDescriptor()
      const cedula = cedulaRef.current
      if (!face || !cedula) return false
      setStep('sending')
      stopCamera()
      await submitBiometricCheck({
        selfie: await canvasToJpeg(frame),
        cedula: cedula.blob,
        matchDistance: faceapi.euclideanDistance(Array.from(face.descriptor), Array.from(cedula.descriptor)),
        challenges,
      })
      onDone()
      return true
    }

    async function scan(faceapi: FaceApi) {
      const video = videoRef.current
      if (!active || !video) return
      if (Date.now() > deadline) {
        stopCamera()
        setError('Se acabó el tiempo. Vuelve a intentarlo con buena luz.')
        return
      }
      const faces = await faceapi.detectAllFaces(video, detectorOptions(faceapi, 224)).withFaceLandmarks()
      if (!active) return
      if (faces.length !== 1) {
        setInstruction(faces.length ? 'Solo debe aparecer una persona' : 'Coloca tu cara dentro del óvalo')
      } else {
        const points = faces[0].landmarks.positions
        const sample = {
          eyeOpenness: (eyeAspectRatio(points.slice(36, 42)) + eyeAspectRatio(points.slice(42, 48))) / 2,
          yaw: yawRatio(points[30], points[0], points[16]),
        }
        tracker.update(sample)
        if (!tracker.done) {
          setInstruction(tracker.current ? CHALLENGE_INSTRUCTIONS[tracker.current] : '')
        } else if (isFacingCamera(sample)) {
          setInstruction('Mira de frente…')
          if (await finish(faceapi, video)) return
        } else {
          setInstruction('Mira de frente a la cámara')
        }
      }
      timer = window.setTimeout(() => { scan(faceapi).catch(handleFailure) }, SCAN_INTERVAL_MS)
    }

    function handleFailure(failure: unknown) {
      if (!active) return
      stopCamera()
      setStep('selfie')
      setError(failure instanceof Error ? failure.message : 'No pudimos completar la verificación.')
    }

    setError('')
    setInstruction('Abriendo la cámara…')
    Promise.all([loadFaceApi(), startCamera('user')])
      .then(([faceapi]) => scan(faceapi))
      .catch((failure: unknown) => { if (active) setError(cameraErrorMessage(failure)) })

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [step, challenges, onDone, startCamera, stopCamera])

  async function captureCedula() {
    const video = videoRef.current
    if (!video) return
    setLoading(true)
    setError('')
    try {
      const faceapi = await loadFaceApi()
      const frame = grabFrame(video)
      const face = await faceapi.detectSingleFace(frame, detectorOptions(faceapi, 608)).withFaceLandmarks().withFaceDescriptor()
      if (!face) {
        setError('No vemos la foto de tu cédula. Acércala, evita reflejos y vuelve a intentarlo.')
        return
      }
      cedulaRef.current = { blob: await canvasToJpeg(frame), descriptor: face.descriptor as Float32Array }
      setStep('selfie')
    } catch {
      setError('No pudimos cargar la verificación. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="biometric-capture">
      {step === 'consent' && (
        <>
          <h3>Antes de empezar</h3>
          <ul>
            <li>Te pediremos una foto de tu cédula y una foto en vivo de tu cara.</li>
            <li>Solo el equipo de Mercapro las revisa. Las borramos cuando termina la revisión.</li>
            <li>Es opcional. Sin este paso conservas tu etiqueta Verificado.</li>
          </ul>
          <label className="auth-consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.currentTarget.checked)} />
            <span>Autorizo a Mercapro a tratar mi imagen facial y mi cédula para verificar mi identidad, según la <a href="/privacidad" target="_blank" rel="noreferrer">política de privacidad</a>.</span>
          </label>
          <div className="biometric-capture__actions">
            <button className="button button--quiet" type="button" onClick={onCancel}>Cancelar</button>
            <button className="button button--primary" type="button" disabled={!consent} onClick={() => setStep('cedula')}>Continuar</button>
          </div>
        </>
      )}

      {(step === 'cedula' || step === 'selfie') && (
        <>
          <h3>{step === 'cedula' ? 'Paso 1 de 2: tu cédula' : 'Paso 2 de 2: tu cara'}</h3>
          <p>{step === 'cedula' ? 'Coloca el frente de tu cédula dentro del recuadro, con buena luz.' : 'Sigue las instrucciones en pantalla.'}</p>
          <div className={`biometric-capture__stage biometric-capture__stage--${step}`}>
            <video ref={videoRef} playsInline muted aria-label="Vista de la cámara" />
            <span className="biometric-capture__guide" aria-hidden="true" />
          </div>
          {step === 'selfie' && <p className="biometric-capture__instruction" role="status" aria-live="assertive">{instruction}</p>}
          <div className="biometric-capture__actions">
            <button className="button button--quiet" type="button" onClick={onCancel}>Cancelar</button>
            {step === 'cedula' && <button className="button button--primary" type="button" disabled={loading} onClick={() => void captureCedula()}>{loading ? 'Revisando…' : 'Tomar foto'}</button>}
          </div>
        </>
      )}

      {step === 'sending' && <p role="status">Enviando tu verificación…</p>}
      {error && <p className="producer-product-form__error" role="alert">{error}</p>}
    </div>
  )
}
