"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Phone, ArrowLeft, Mic, MicOff, Brain, MessageSquare } from "lucide-react"
import { LiveChatClient } from "@/lib/websocket-client"

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

  // Audio processing for real-time streaming
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null)
  const isStreamingRef = useRef<boolean>(false)

  const addDebugInfo = (info: string) => {
    console.log("DEBUG:", info)
    setDebugInfo((prev) => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${info}`])
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

      // STEP 1: Initialize WebSocket connection
      addPipelineStep("WebSocket Connection", "processing", "Connecting to instant AI server")
      await initializeInstantGeminiLive()

      // STEP 2: Setup microphone for real-time streaming
      addPipelineStep("Microphone Setup", "processing", "Setting up instant audio streaming")
      await setupInstantRealtimeAudio()

      // STEP 3: Setup speaker for instant AI responses
      addPipelineStep("Speaker Setup", "processing", "Testing instant audio output")
      await setupInstantSpeakerOutput()

      // STEP 4: Start real-time monitoring
      addPipelineStep("Real-time Monitoring", "processing", "Starting instant speech detection")
      startInstantRealtimeMonitoring()

      // System Ready!
      addPipelineStep("Instant AI Ready", "complete", "All systems operational for instant responses")
      setConversationState("ready")
      setIsListening(true)
      setCurrentSuggestion("🚀 Instant AI Wingman Ready! Start talking for immediate AI coaching!")
      setCurrentStep("Ready - Instant Listening & Response")

      addDebugInfo("✅ Instant AI Wingman system initialized")
    } catch (error: any) {
      console.error("Instant AI Wingman initialization error:", error)
      addPipelineStep("Initialization Failed", "error", error.message)
      setConversationState("error")
      setCurrentSuggestion(`❌ Setup Error: ${error.message}`)
    }
  }

  const initializeInstantGeminiLive = async () => {
    try {
      // Create WebSocket client for instant responses
      liveChatClientRef.current = new LiveChatClient()

      // Set up event handlers for instant processing
      liveChatClientRef.current.onStatusUpdate = (status) => {
        addDebugInfo(`🤖 Gemini Status: ${status}`)
        if (status.includes("session ready")) {
          setIsGeminiConnected(true)
          updatePipelineStep("WebSocket Connection", "complete", "Connected for instant responses")
        }
      }

      // Handle instant audio responses (priority)
      liveChatClientRef.current.onAudioResponse = (audioData, sampleRate) => {
        addDebugInfo(`🔊 Instant Audio: ${audioData.length} samples at ${sampleRate}Hz`)
        handleInstantGeminiAudioResponse(audioData, sampleRate)
      }

      // Handle text display after audio (secondary)
      liveChatClientRef.current.onTextDisplay = (text) => {
        addDebugInfo(`📝 Text Display: ${text}`)
        handleGeminiTextDisplay(text)
      }

      liveChatClientRef.current.onError = (error) => {
        addDebugInfo(`❌ Gemini Error: ${error.message}`)
        setIsGeminiConnected(false)
      }

      liveChatClientRef.current.onConnect = () => {
        addDebugInfo("✅ Connected to instant AI proxy")
      }

      liveChatClientRef.current.onDisconnect = () => {
        addDebugInfo("🔌 Disconnected from instant AI proxy")
        setIsGeminiConnected(false)
      }

      // Connect to proxy and then to Gemini
      await liveChatClientRef.current.connect()
      liveChatClientRef.current.connectToGemini()

      addDebugInfo("✅ Instant Gemini Live API connection initiated")
    } catch (error) {
      throw new Error(`Failed to connect to Instant Gemini Live: ${error.message}`)
    }
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
      }

      source.start()
      addDebugInfo(`🔊 Playing instant AI audio response: ${audioData.length} samples at ${sampleRate}Hz`)
    } catch (error) {
      addDebugInfo(`❌ Instant audio playback error: ${error.message}`)
      // Fallback to ready state
      setConversationState("ready")
      setCurrentSuggestion("🚀 Ready for your next line!")
      setCurrentStep("Ready - Instant Listening & Response")
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
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {pipelineSteps.slice(-6).map((step, index) => (
                <div key={index} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
                  <div
                    className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      step.status === "complete"
                        ? "bg-green-500"
                        : step.status === "processing"
                          ? "bg-yellow-500 animate-pulse"
                          : step.status === "error"
                            ? "bg-red-500"
                            : "bg-gray-500"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-white text-sm font-medium truncate">{step.step}</span>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {step.duration && <span className="text-xs text-green-400">{step.duration}ms</span>}
                        <span className="text-xs text-gray-400">{new Date(step.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                    {step.details && <p className="text-xs text-gray-300 mt-1 truncate">{step.details}</p>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Text Display Window (shown after audio) */}
        {showTextDisplay && displayedText && (
          <Card className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur border-purple-300/30 animate-in slide-in-from-bottom-4">
            <CardHeader>
              <CardTitle className="text-white text-center flex items-center justify-center gap-2">
                <MessageSquare className="h-5 w-5" />📝 AI Coaching Response
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="bg-white/10 rounded-lg p-4">
                  <p className="text-lg font-medium text-white leading-relaxed">"{displayedText}"</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-purple-300 mt-3">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-sm">💬 AI coaching suggestion displayed after audio</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Status Display */}
        <Card className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur border-purple-300/30">
          <CardHeader>
            <CardTitle className="text-white text-center flex items-center justify-center gap-2">
              <Brain className="h-5 w-5" />⚡ Instant AI Wingman Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <p className="text-xl font-bold text-white leading-relaxed min-h-[3rem] flex items-center justify-center px-4">
                {currentSuggestion}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Audio Monitor */}
        <Card className="bg-white/5 backdrop-blur border-white/10">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <h3 className="text-white font-semibold">🎤 Instant Audio Stream</h3>
              <AudioVisualizer audioLevel={audioLevel} isActive={speechDetected} rawLevel={rawAudioLevel} />
              <div className="text-xs text-gray-400">
                {isGeminiConnected ? "⚡ Streaming to Instant AI" : "⚠️ Waiting for AI connection"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversation History */}
        {conversationHistory.length > 0 && (
          <Card className="bg-white/5 backdrop-blur border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-sm">💬 Recent AI Coaching</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {conversationHistory.slice(-4).map((entry, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-semibold text-purple-300">⚡ Instant AI:</span>
                    <span className="text-gray-300 ml-2">"{entry.text}"</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* System Info */}
        <Card className="bg-yellow-500/10 border-yellow-400/30">
          <CardContent className="pt-6">
            <div className="text-center space-y-2">
              <h3 className="text-yellow-200 font-semibold">⚡ Instant AI Wingman System</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-yellow-100">Instant Audio</p>
                  <p className="text-xs text-yellow-200">16kHz streaming</p>
                </div>
                <div>
                  <p className="text-yellow-100">Instant AI</p>
                  <p className="text-xs text-yellow-200">Sub-second responses</p>
                </div>
                <div>
                  <p className="text-yellow-100">Instant Playback</p>
                  <p className="text-xs text-yellow-200">24kHz audio</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
