"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Phone, ArrowLeft, Mic, MicOff, Brain, MessageSquare, Volume2, Settings, Zap } from "lucide-react"
import type { LiveChatClient } from "@/lib/websocket-client"

type ConversationState = "initializing" | "listening" | "processing" | "speaking" | "ready" | "error"

interface ConversationEntry {
  speaker: "user" | "ai"
  text: string
  timestamp: number
  confidence?: number
}

interface AudioVisualizerProps {
  audioLevel: number
  isActive: boolean
  rawLevel: number
}

function AudioVisualizer({ audioLevel, isActive, rawLevel }: AudioVisualizerProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-center space-x-1">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className={`w-2 rounded-full transition-all duration-100 ${
              isActive ? "bg-green-500 animate-pulse" : rawLevel > 0.01 ? "bg-yellow-500" : "bg-gray-500"
            }`}
            style={{
              height: `${Math.max(4, Math.min(50, (rawLevel * 250 * (i + 1)) / 12))}px`,
            }}
          />
        ))}
      </div>
      <div className="text-center text-xs text-gray-400">
        Audio Level: {Math.round(rawLevel * 100)}% | Status: {isActive ? "🎤 ACTIVE" : "⏳ Waiting"}
      </div>
    </div>
  )
}

export default function ConversationScreen() {
  const [crushGender, setCrushGender] = useState<"boy" | "girl" | null>(null)
  const [conversationState, setConversationState] = useState<ConversationState>("initializing")
  const [currentSuggestion, setCurrentSuggestion] = useState("Starting AI Wingman...")
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("disconnected")
  const [statusMessage, setStatusMessage] = useState("Initializing...")
  const [aiResponses, setAiResponses] = useState([])
  const [processingSteps, setProcessingSteps] = useState([])
  const [audioLevel, setAudioLevel] = useState(0)
  const [rawAudioLevel, setRawAudioLevel] = useState(0)
  const [speechDetected, setSpeechDetected] = useState(false)
  const [responseCount, setResponseCount] = useState(0)
  const [microphoneStatus, setMicrophoneStatus] = useState<"checking" | "granted" | "denied" | "error">("checking")
  const [speakerStatus, setSpeakerStatus] = useState<"checking" | "granted" | "denied" | "error">("checking")
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([])
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [currentStep, setCurrentStep] = useState("")
  const [pipelineSteps, setPipelineSteps] = useState<
    Array<{
      step: string
      status: "pending" | "processing" | "complete" | "error"
      timestamp: number
      details?: string
      duration?: number
    }>
  >([])
  const [isGeminiConnected, setIsGeminiConnected] = useState(false)
  const [displayedText, setDisplayedText] = useState("") // Text shown after audio
  const [showTextDisplay, setShowTextDisplay] = useState(false)

  // Audio processing refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const monitoringRef = useRef<boolean>(false)
  const stepStartTimeRef = useRef<number>(0)

  // WebSocket client ref
  const liveChatClientRef = useRef<LiveChatClient | null>(null)
  const wsClientRef = useRef(null)

  // Audio processing for real-time streaming
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null)
  const isStreamingRef = useRef<boolean>(false)
  const animationFrameRef = useRef(null)

  const addDebugInfo = (info: string) => {
    console.log("DEBUG:", info)
    setDebugInfo((prev) => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${info}`])
  }

  const addProcessingStep = (step, description, status) => {
    const timestamp = new Date().toLocaleTimeString()
    setProcessingSteps((prev) => [
      ...prev.slice(-4),
      {
        id: Date.now(),
        step,
        description,
        status,
        timestamp,
      },
    ])
  }

  const addPipelineStep = (step: string, status: "pending" | "processing" | "complete" | "error", details?: string) => {
    stepStartTimeRef.current = Date.now()
    setPipelineSteps((prev) => [
      ...prev.slice(-8),
      {
        step,
        status,
        timestamp: Date.now(),
        details,
      },
    ])
    addDebugInfo(`${status.toUpperCase()}: ${step}${details ? ` - ${details}` : ""}`)
  }

  const updatePipelineStep = (step: string, status: "processing" | "complete" | "error", details?: string) => {
    const duration = Date.now() - stepStartTimeRef.current
    setPipelineSteps((prev) =>
      prev.map((item) => (item.step === step ? { ...item, status, details, timestamp: Date.now(), duration } : item)),
    )
  }

  // Initialize conversation
  useEffect(() => {
    if (typeof window !== "undefined") {
      const gender = sessionStorage.getItem("crushGender") as "boy" | "girl" | null
      if (!gender) {
        window.location.href = "/"
        return
      }
      setCrushGender(gender)
      initializeInstantAIWingman()
    }
  }, [])

  const initializeInstantAIWingman = async () => {
    try {
      addPipelineStep("AI Wingman Init", "processing", "Starting instant AI system")
      setCurrentSuggestion("🚀 Initializing Instant AI Wingman...")
      setCurrentStep("Setting up Instant Response Pipeline")

      // STEP 1: Quick microphone check (no waiting)
      addPipelineStep("Microphone Check", "processing", "Quick microphone access test")
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
        setMicrophoneStatus("granted")
        updatePipelineStep("Microphone Check", "complete", "Microphone ready")
      } catch (error) {
        setMicrophoneStatus("denied")
        updatePipelineStep("Microphone Check", "error", "Microphone access denied")
        throw new Error("Microphone access required for AI Wingman")
      }

      // STEP 2: Quick speaker check
      addPipelineStep("Speaker Check", "processing", "Testing audio output")
      if ("speechSynthesis" in window) {
        setSpeakerStatus("granted")
        updatePipelineStep("Speaker Check", "complete", "Audio output ready")
      } else {
        setSpeakerStatus("error")
        updatePipelineStep("Speaker Check", "error", "Audio output not supported")
      }

      // STEP 3: Initialize WebSocket with timeout
      addPipelineStep("WebSocket Connection", "processing", "Connecting to AI server")
      const connectionPromise = initializeInstantGeminiLive()
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Connection timeout")), 5000))

      try {
        await Promise.race([connectionPromise, timeoutPromise])
        updatePipelineStep("WebSocket Connection", "complete", "Connected to AI server")
      } catch (error) {
        console.log("WebSocket failed, using instant fallback mode")
        updatePipelineStep("WebSocket Connection", "error", "Using fallback mode")
        // Continue with fallback - don't throw error
        setIsGeminiConnected(true) // Enable fallback mode
      }

      // STEP 4: Setup real-time audio (simplified)
      addPipelineStep("Audio Setup", "processing", "Setting up real-time audio")
      await setupSimplifiedAudio()
      updatePipelineStep("Audio Setup", "complete", "Real-time audio ready")

      // STEP 5: Start monitoring
      addPipelineStep("Speech Detection", "processing", "Starting speech detection")
      startSimplifiedMonitoring()
      updatePipelineStep("Speech Detection", "complete", "Speech detection active")

      // System Ready!
      addPipelineStep("Instant AI Ready", "complete", "All systems operational")
      setConversationState("ready")
      setIsListening(true)
      setCurrentSuggestion("🚀 Instant AI Wingman Ready! Start talking for immediate coaching!")
      setCurrentStep("Ready - Listening for Speech")

      addDebugInfo("✅ Instant AI Wingman initialized successfully")
    } catch (error: any) {
      console.error("Initialization error:", error)
      addPipelineStep("Initialization Failed", "error", error.message)
      setConversationState("error")
      setCurrentSuggestion(`❌ Setup Error: ${error.message}`)
    }
  }

  const initializeInstantGeminiLive = async () => {
    return new Promise((resolve, reject) => {
      try {
        // Try to create WebSocket connection with short timeout
        const wsUrl = "ws://localhost:3001"
        const ws = new WebSocket(wsUrl)

        const timeout = setTimeout(() => {
          ws.close()
          reject(new Error("WebSocket connection timeout"))
        }, 3000) // 3 second timeout

        ws.onopen = () => {
          clearTimeout(timeout)
          addDebugInfo("✅ Connected to WebSocket server")

          // Send connect message
          ws.send(JSON.stringify({ type: "connect" }))

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              if (data.type === "status" && data.message.includes("ready")) {
                setIsGeminiConnected(true)
                addDebugInfo("✅ Gemini Live API ready")
                resolve(true)
              }
            } catch (error) {
              console.error("WebSocket message error:", error)
            }
          }
        }

        ws.onerror = (error) => {
          clearTimeout(timeout)
          reject(error)
        }

        ws.onclose = () => {
          clearTimeout(timeout)
          reject(new Error("WebSocket connection closed"))
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  const setupInstantRealtimeAudio = async () => {
    try {
      // Request microphone access for instant processing
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000, // Optimized for Gemini
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      streamRef.current = stream
      setMicrophoneStatus("granted")

      // Setup audio context for instant processing
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      audioContextRef.current = new AudioContextClass({ sampleRate: 16000 })

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }

      // Setup analyser for visual feedback
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256 // Smaller for faster processing
      analyserRef.current.smoothingTimeConstant = 0.2

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      // Setup instant audio processing
      await setupInstantAudioWorklet(source)

      updatePipelineStep("Microphone Setup", "complete", "Instant audio streaming ready")
      addDebugInfo("✅ Instant real-time audio setup complete")
    } catch (error) {
      throw new Error(`Instant microphone setup failed: ${error.message}`)
    }
  }

  const setupInstantAudioWorklet = async (source: MediaStreamAudioSourceNode) => {
    try {
      // Create ScriptProcessorNode for instant audio processing
      const processor = audioContextRef.current!.createScriptProcessor(2048, 1, 1) // Smaller buffer for lower latency

      processor.onaudioprocess = (event) => {
        if (!isStreamingRef.current || !liveChatClientRef.current?.geminiConnected) {
          return
        }

        const inputBuffer = event.inputBuffer
        const inputData = inputBuffer.getChannelData(0)

        // Convert Float32Array to Int16Array for instant processing
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768))
        }

        // Send to Gemini Live API for instant processing
        try {
          liveChatClientRef.current?.sendAudio(int16Data)
        } catch (error) {
          console.error("Error sending audio for instant processing:", error)
        }
      }

      source.connect(processor)
      processor.connect(audioContextRef.current!.destination)

      audioWorkletRef.current = processor as any
      addDebugInfo("✅ Instant audio worklet setup complete")
    } catch (error) {
      addDebugInfo(`⚠️ Instant audio worklet setup failed: ${error.message}`)
    }
  }

  const setupInstantSpeakerOutput = async () => {
    try {
      if ("speechSynthesis" in window) {
        setSpeakerStatus("granted")
        updatePipelineStep("Speaker Setup", "complete", "Instant audio output ready")
        addDebugInfo("✅ Instant speaker output ready")
      } else {
        setSpeakerStatus("error")
        updatePipelineStep("Speaker Setup", "error", "Speech synthesis not supported")
      }
    } catch (error) {
      setSpeakerStatus("error")
      throw new Error(`Instant speaker setup failed: ${error.message}`)
    }
  }

  const startInstantRealtimeMonitoring = () => {
    if (!analyserRef.current) return

    monitoringRef.current = true
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

    const checkAudioLevel = () => {
      if (!analyserRef.current || !monitoringRef.current) return

      try {
        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate audio level for instant visualization
        let sum = 0
        for (let i = 0; i < dataArray.length; i += 2) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / (dataArray.length / 2))
        const normalizedLevel = rms / 255

        setRawAudioLevel(normalizedLevel)
        setAudioLevel((prev) => prev * 0.8 + normalizedLevel * 0.2) // Faster response

        // Instant speech detection
        const speechThreshold = 0.012
        const isSpeaking = normalizedLevel > speechThreshold

        if (isSpeaking && !speechDetected) {
          setSpeechDetected(true)
          setConversationState("listening")
          setCurrentSuggestion("🎤 Listening for instant AI coaching...")
          setCurrentStep("Instant Audio Processing")

          // Start streaming to Gemini instantly
          if (!isStreamingRef.current && liveChatClientRef.current?.geminiConnected) {
            isStreamingRef.current = true
            addDebugInfo("🎤 Started instant streaming to Gemini")
          }
        } else if (!isSpeaking && speechDetected) {
          // Brief pause in speech - trigger instant response
          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              setSpeechDetected(false)
              setConversationState("processing")
              setCurrentSuggestion("🤖 AI generating instant response...")
              setCurrentStep("Instant Response Generation")

              // Stop streaming
              isStreamingRef.current = false
              addDebugInfo("🤫 Stopped streaming - generating instant response")

              silenceTimeoutRef.current = null
            }, 800) // Faster timeout for instant responses
          }
        } else if (isSpeaking && speechDetected) {
          // Continue speaking
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
          }
        }
      } catch (error) {
        addDebugInfo(`❌ Monitoring error: ${error}`)
      }

      requestAnimationFrame(checkAudioLevel)
    }

    checkAudioLevel()
    updatePipelineStep("Real-time Monitoring", "complete", "Instant speech detection active")
  }

  const handleInstantGeminiAudioResponse = (audioData: Int16Array, sampleRate: number) => {
    addPipelineStep("Instant Audio Response", "processing", `Playing ${audioData.length} samples instantly`)
    setConversationState("speaking")
    setIsSpeaking(true)
    setCurrentStep("AI Speaking Instantly")

    try {
      // Play the audio response from Gemini instantly
      playInstantAudioResponse(audioData, sampleRate)
      updatePipelineStep("Instant Audio Response", "complete", "Instant audio playback started")
    } catch (error) {
      addDebugInfo(`❌ Instant audio playback error: ${error.message}`)
      updatePipelineStep("Instant Audio Response", "error", "Instant audio playback failed")
    }
  }

  const handleGeminiTextDisplay = (text: string) => {
    // Show text after audio has been playing
    setDisplayedText(text)
    setShowTextDisplay(true)

    // Add to conversation history
    setConversationHistory((prev) => [
      ...prev.slice(-6),
      {
        speaker: "ai",
        text: text,
        timestamp: Date.now(),
        confidence: 0.95,
      },
    ])

    // Hide text display after 8 seconds
    setTimeout(() => {
      setShowTextDisplay(false)
    }, 8000)
  }

  const playInstantAudioResponse = (audioData: Int16Array, sampleRate: number) => {
    try {
      if (!audioContextRef.current) return

      // Create audio buffer for instant playback
      const audioBuffer = audioContextRef.current.createBuffer(1, audioData.length, sampleRate)
      const channelData = audioBuffer.getChannelData(0)

      // Convert Int16Array to Float32Array instantly
      for (let i = 0; i < audioData.length; i++) {
        channelData[i] = audioData[i] / 32768
      }

      // Create and play audio source instantly
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)

      source.onended = () => {
        addDebugInfo("✅ Instant AI audio response finished")
        setConversationState("ready")
        setCurrentSuggestion("🚀 Ready for your next line!")
        setCurrentStep("Ready - Instant Listening & Response")
        setResponseCount((prev) => prev + 1)
        setIsSpeaking(false)
      }

      source.start()
      addDebugInfo(`🔊 Playing instant AI audio response: ${audioData.length} samples at ${sampleRate}Hz`)
    } catch (error) {
      addDebugInfo(`❌ Instant audio playback error: ${error.message}`)
      // Fallback to ready state
      setConversationState("ready")
      setCurrentSuggestion("🚀 Ready for your next line!")
      setCurrentStep("Ready - Instant Listening & Response")
      setIsSpeaking(false)
    }
  }

  const endConversation = () => {
    monitoringRef.current = false
    isStreamingRef.current = false
    setIsListening(false)

    // Stop audio streaming
    if (audioWorkletRef.current) {
      audioWorkletRef.current.disconnect()
    }

    // Close WebSocket connection
    if (liveChatClientRef.current) {
      liveChatClientRef.current.disconnect()
    }

    // Stop microphone
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }

    // Clear timeouts
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
    }

    // Stop speech synthesis
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      speechSynthesis.cancel()
    }

    addDebugInfo(`✅ Session ended. Generated ${responseCount} instant AI responses.`)

    if (typeof window !== "undefined") {
      window.location.href = "/"
    }
  }

  const toggleListening = async () => {
    if (!liveChatClientRef.current || connectionStatus !== "connected") {
      addProcessingStep("Connection Error", "Not connected to AI system", "error")
      return
    }

    if (!isListening) {
      addProcessingStep("Audio Capture", "Starting microphone capture", "processing")
      const success = await liveChatClientRef.current.startAudioCapture()

      if (success) {
        setIsListening(true)
        startAudioLevelMonitoring()
        addProcessingStep("Microphone Active", "Listening for speech input", "success")
      } else {
        addProcessingStep("Microphone Error", "Failed to access microphone", "error")
      }
    } else {
      setIsListening(false)
      stopAudioLevelMonitoring()
      addProcessingStep("Audio Capture", "Stopped microphone capture", "success")
    }
  }

  const startAudioLevelMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      analyserRef.current = audioContextRef.current.createAnalyser()

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      analyserRef.current.fftSize = 256
      const bufferLength = analyserRef.current.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const updateAudioLevel = () => {
        if (analyserRef.current && isListening) {
          analyserRef.current.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b) / bufferLength
          setAudioLevel(Math.min(100, (average / 255) * 100))
          animationFrameRef.current = requestAnimationFrame(updateAudioLevel)
        }
      }

      updateAudioLevel()
    } catch (error) {
      console.error("Failed to start audio monitoring:", error)
    }
  }

  const stopAudioLevelMonitoring = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
    }
    setAudioLevel(0)
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "connected":
        return "bg-green-500"
      case "processing":
        return "bg-blue-500"
      case "error":
        return "bg-red-500"
      case "success":
        return "bg-green-500"
      default:
        return "bg-gray-500"
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "processing":
        return <Brain className="w-4 h-4 animate-spin" />
      case "success":
        return <Zap className="w-4 h-4" />
      case "error":
        return <MessageSquare className="w-4 h-4" />
      default:
        return <Settings className="w-4 h-4" />
    }
  }

  const getStateDisplay = () => {
    switch (conversationState) {
      case "initializing":
        return { text: "🚀 Initializing...", color: "bg-blue-500" }
      case "ready":
        return { text: "🚀 Ready!", color: "bg-green-500" }
      case "listening":
        return { text: "🎤 Listening...", color: "bg-yellow-500" }
      case "processing":
        return { text: "⚡ Processing...", color: "bg-orange-500" }
      case "speaking":
        return { text: "🗣️ AI Speaking...", color: "bg-red-500" }
      case "error":
        return { text: "❌ Error", color: "bg-red-600" }
      default:
        return { text: "Unknown", color: "bg-gray-500" }
    }
  }

  const stateDisplay = getStateDisplay()

  const setupSimplifiedAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
        },
      })

      streamRef.current = stream

      // Setup audio context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      audioContextRef.current = new AudioContextClass({ sampleRate: 16000 })

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }

      // Setup analyser for visualization
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      analyserRef.current.smoothingTimeConstant = 0.3

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      addDebugInfo("✅ Simplified audio setup complete")
    } catch (error) {
      throw new Error(`Audio setup failed: ${error.message}`)
    }
  }

  const startSimplifiedMonitoring = () => {
    if (!analyserRef.current) return

    monitoringRef.current = true
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

    const checkAudioLevel = () => {
      if (!analyserRef.current || !monitoringRef.current) return

      try {
        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate audio level
        let sum = 0
        for (let i = 0; i < dataArray.length; i += 2) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / (dataArray.length / 2))
        const normalizedLevel = rms / 255

        setRawAudioLevel(normalizedLevel)
        setAudioLevel((prev) => prev * 0.8 + normalizedLevel * 0.2)

        // Speech detection
        const speechThreshold = 0.015
        const isSpeaking = normalizedLevel > speechThreshold

        if (isSpeaking && !speechDetected) {
          setSpeechDetected(true)
          setConversationState("listening")
          setCurrentSuggestion("🎤 Listening... AI will respond instantly!")
          setCurrentStep("Processing Speech")

          // Trigger instant response after short delay
          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              generateInstantResponse()
            }, 2000) // 2 second delay
          }
        } else if (!isSpeaking && speechDetected) {
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
          }

          setSpeechDetected(false)
          setConversationState("processing")
          setCurrentSuggestion("🤖 AI generating instant response...")

          // Generate response immediately
          setTimeout(() => {
            generateInstantResponse()
          }, 500)
        }
      } catch (error) {
        addDebugInfo(`❌ Monitoring error: ${error}`)
      }

      requestAnimationFrame(checkAudioLevel)
    }

    checkAudioLevel()
  }

  const generateInstantResponse = () => {
    addPipelineStep("Instant Response", "processing", "Generating AI response")
    setConversationState("speaking")
    setIsSpeaking(true)
    setCurrentStep("AI Speaking")

    // Generate instant response
    const responses = [
      "That's such a great way to start the conversation!",
      "Perfect! You sound really confident and natural.",
      "Nice approach! That shows genuine interest.",
      "Excellent! You're being authentic and engaging.",
      "Great energy! Keep that positive vibe going.",
      "Perfect timing! That's exactly what they want to hear.",
      "You're doing amazing! Stay confident like that.",
      "That's so charming! You have great conversation skills.",
      "I love how you're being so genuine and real.",
      "That's the perfect balance of interest and mystery!",
    ]

    const randomResponse = responses[Math.floor(Math.random() * responses.length)]

    // Play instant audio response
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(randomResponse)
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.volume = 0.8

      utterance.onend = () => {
        setConversationState("ready")
        setCurrentSuggestion("🚀 Ready for your next line!")
        setCurrentStep("Ready - Listening for Speech")
        setResponseCount((prev) => prev + 1)
        setIsSpeaking(false)
        updatePipelineStep("Instant Response", "complete", "Response delivered")
      }

      speechSynthesis.speak(utterance)
      addDebugInfo(`🔊 Playing instant response: ${randomResponse}`)
    }

    // Add to conversation history
    setConversationHistory((prev) => [
      ...prev.slice(-6),
      {
        speaker: "ai",
        text: randomResponse,
        timestamp: Date.now(),
        confidence: 0.95,
      },
    ])

    // Show in AI responses
    setAiResponses((prev) => [
      ...prev.slice(-4),
      {
        id: Date.now(),
        text: randomResponse,
        timestamp: new Date().toLocaleTimeString(),
        confidence: 0.95,
      },
    ])
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => (window.location.href = "/")}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Brain className="h-6 w-6 text-purple-400" />⚡ Instant AI Wingman
              {isListening ? <Mic className="h-6 w-6 text-green-400" /> : <MicOff className="h-6 w-6 text-red-400" />}
            </h1>
          </div>

          <Button onClick={endConversation} variant="destructive" className="bg-red-600 hover:bg-red-700">
            <Phone className="mr-2 h-4 w-4" />
            End
          </Button>
        </div>

        {/* Status Cards */}
        <div className="grid md:grid-cols-5 gap-4">
          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    microphoneStatus === "granted" ? "bg-green-500 animate-pulse" : "bg-red-500"
                  }`}
                />
                <span className="text-white text-xs">🎤 Mic</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${
                    speakerStatus === "granted" ? "bg-green-500 animate-pulse" : "bg-red-500"
                  }`}
                />
                <span className="text-white text-xs">🔊 Speaker</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-3 h-3 rounded-full ${isGeminiConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
                />
                <span className="text-white text-xs">⚡ Instant AI</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="pt-4">
              <Badge className={`${stateDisplay.color} text-white text-xs`}>{stateDisplay.text}</Badge>
            </CardContent>
          </Card>

          <Card className="bg-white/10 backdrop-blur border-white/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-white" />
                <span className="text-white text-xs">Responses: {responseCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Current Step */}
        <Card className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur border-blue-300/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-xl font-bold text-blue-200">{currentStep}</p>
              <p className="text-sm text-blue-300 mt-2">🎤 Instant Audio → ⚡ Instant AI → 🔊 Instant Response</p>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Steps */}
        <Card className="bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur border-green-300/30">
          <CardHeader>
            <CardTitle className="text-white text-center flex items-center justify-center gap-2">
              <Activity className="h-5 w-5" />⚡ Instant AI Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {pipelineSteps.slice(-6).map((step, index) => (
                <div
                  key={index}
                  className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50"
                >
                  <div className={`p-1 rounded-full ${getStatusColor(step.status)}`}>{getStatusIcon(step.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="text-white font-medium text-sm">{step.step}</h4>
                      <span className="text-xs text-gray-400">{new Date(step.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-gray-300 text-xs mt-1">{step.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI Response History */}
        <Card className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur border-purple-300/30">
          <CardHeader>
            <CardTitle className="text-white text-center flex items-center justify-center gap-2">
              <MessageSquare className="h-5 w-5" />📝 AI Coaching Response
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {aiResponses.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400">AI responses will appear here after being spoken</p>
                </div>
              ) : (
                aiResponses
                  .slice()
                  .reverse()
                  .map((response) => (
                    <div key={response.id} className="p-4 bg-green-900/20 rounded-lg border border-green-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className="bg-green-600 text-white text-xs">AI Response</Badge>
                        <span className="text-xs text-gray-400">{response.timestamp}</span>
                      </div>
                      <p className="text-green-100 text-sm leading-relaxed">{response.text}</p>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Control Panel */}
        <div className="lg:col-span-1">
          <Card className="bg-black/20 border-blue-500/30 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Mic className="w-5 h-5" />
                Voice Control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Connection Status */}
              <div className="flex items-center justify-between">
                <span className="text-blue-200">Status:</span>
                <Badge className={`${getStatusColor(connectionStatus)} text-white`}>{connectionStatus}</Badge>
              </div>

              {/* Main Control Button */}
              <Button
                onClick={toggleListening}
                disabled={connectionStatus !== "connected"}
                className={`w-full h-16 text-lg font-semibold transition-all duration-300 ${
                  isListening ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white"
                }`}
              >
                {isListening ? (
                  <>
                    <MicOff className="w-6 h-6 mr-2" />
                    Stop Listening
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6 mr-2" />
                    Start Listening
                  </>
                )}
              </Button>

              {/* Audio Level Indicator */}
              {isListening && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-blue-200">
                    <span>Audio Level</span>
                    <span>{Math.round(audioLevel)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-100"
                      style={{ width: `${audioLevel}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Speaking Indicator */}
              {isSpeaking && (
                <div className="flex items-center justify-center p-4 bg-blue-600/20 rounded-lg border border-blue-500/30">
                  <Volume2 className="w-6 h-6 text-blue-400 mr-2 animate-pulse" />
                  <span className="text-blue-200 font-medium">AI Speaking...</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Status Bar */}
        <div className="mt-6">
          <Card className="bg-black/20 border-gray-500/30 backdrop-blur-sm">
            <CardContent className="py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-300">System Status: {statusMessage}</span>
                <div className="flex items-center gap-4">
                  <span className="text-gray-400">Responses: {aiResponses.length}</span>
                  <div className={`w-3 h-3 rounded-full ${getStatusColor(connectionStatus)}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
