"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Phone, ArrowLeft, Mic, MicOff, Brain, MessageSquare, Volume2, Settings, Zap } from "lucide-react"

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
  const [currentSuggestion, setCurrentSuggestion] = useState("Starting Rizzler AI...")
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
  const [isRizzlerConnected, setIsRizzlerConnected] = useState(false)
  const [displayedText, setDisplayedText] = useState("")
  const [showTextDisplay, setShowTextDisplay] = useState(false)

  // Audio processing refs
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const monitoringRef = useRef<boolean>(false)
  const stepStartTimeRef = useRef<number>(0)
  const animationFrameRef = useRef(null)

  const addDebugInfo = (info: string) => {
    console.log("RIZZLER DEBUG:", info)
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
      initializeRizzlerAI()
    }
  }, [])

  const initializeRizzlerAI = async () => {
    try {
      addPipelineStep("Rizzler AI Init", "processing", "Starting Rizzler AI system")
      setCurrentSuggestion("🚀 Initializing Rizzler AI...")
      setCurrentStep("Setting up Rizzler AI")

      // STEP 1: Quick microphone check
      addPipelineStep("Microphone Check", "processing", "Testing microphone access")
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop()) // Stop immediately after test
        setMicrophoneStatus("granted")
        updatePipelineStep("Microphone Check", "complete", "Microphone ready")
      } catch (error) {
        setMicrophoneStatus("denied")
        updatePipelineStep("Microphone Check", "error", "Microphone access denied")
        throw new Error("Microphone access required for Rizzler AI")
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

      // STEP 3: Setup audio system
      addPipelineStep("Audio Setup", "processing", "Setting up audio processing")
      await setupRizzlerAudio()
      updatePipelineStep("Audio Setup", "complete", "Audio system ready")

      // STEP 4: Enable Rizzler AI
      addPipelineStep("Rizzler AI", "processing", "Activating Rizzler AI")
      setIsRizzlerConnected(true)
      setConnectionStatus("connected") // Fix connection status
      updatePipelineStep("Rizzler AI", "complete", "Rizzler AI ready")

      // STEP 5: Start listening
      addPipelineStep("Speech Detection", "processing", "Starting speech detection")
      startRizzlerListening()
      updatePipelineStep("Speech Detection", "complete", "Speech detection active")

      // System Ready!
      addPipelineStep("Rizzler Ready", "complete", "All systems operational")
      setConversationState("ready")
      setIsListening(true)
      setCurrentSuggestion("🚀 Rizzler AI Ready! Start talking and I'll coach you!")
      setCurrentStep("Ready - Listening for Your Voice")
      setStatusMessage("Rizzler AI Connected and Ready")

      addDebugInfo("✅ Rizzler AI initialized successfully")
    } catch (error: any) {
      console.error("Rizzler AI initialization error:", error)
      addPipelineStep("Initialization Failed", "error", error.message)
      setConversationState("error")
      setCurrentSuggestion(`❌ Setup Error: ${error.message}`)
      setStatusMessage(`Error: ${error.message}`)
    }
  }

  const setupRizzlerAudio = async () => {
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

      addDebugInfo("✅ Rizzler audio setup complete")
    } catch (error) {
      throw new Error(`Audio setup failed: ${error.message}`)
    }
  }

  const startRizzlerListening = () => {
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
        setAudioLevel((prev) => prev * 0.7 + normalizedLevel * 0.3)

        // Speech detection - more sensitive
        const speechThreshold = 0.008
        const isSpeaking = normalizedLevel > speechThreshold

        if (isSpeaking && !speechDetected) {
          setSpeechDetected(true)
          setConversationState("listening")
          setCurrentSuggestion("🎤 Rizzler AI is listening...")
          setCurrentStep("Processing Your Voice")
          addDebugInfo("🎤 Speech detected - Rizzler is listening...")

          // Clear any existing timeout
          if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = null
          }
        } else if (!isSpeaking && speechDetected) {
          // Start silence timeout
          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              setSpeechDetected(false)
              setConversationState("processing")
              setCurrentSuggestion("🤖 Rizzler AI is thinking...")
              setCurrentStep("Generating Response")
              addDebugInfo("🤫 Silence detected - Rizzler generating response...")

              // Generate response after brief delay
              setTimeout(() => {
                generateRizzlerResponse()
              }, 300)

              silenceTimeoutRef.current = null
            }, 1000) // 1 second silence timeout
          }
        } else if (isSpeaking && speechDetected) {
          // Continue speaking - cancel timeout
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
  }

  const generateRizzlerResponse = () => {
    addPipelineStep("Rizzler Response", "processing", "Generating Rizzler AI response")
    setConversationState("speaking")
    setIsSpeaking(true)
    setCurrentStep("Rizzler AI Speaking")

    // Rizzler AI responses - always refers to itself as Rizzler AI
    const rizzlerResponses = [
      "Yo, that's fire! Rizzler AI is impressed with your confidence right there!",
      "Damn, you got that natural charm! Rizzler AI sees you leveling up your game!",
      "That's exactly what I'm talking about! Rizzler AI knows you got the rizz!",
      "Smooth operator! Rizzler AI is proud of how you handled that line!",
      "You're absolutely killing it! Rizzler AI can tell you're in your element!",
      "That's the energy we need! Rizzler AI loves seeing you bring that confidence!",
      "Perfect delivery! Rizzler AI knows you're about to have them hooked!",
      "You're speaking their language now! Rizzler AI sees that connection building!",
      "That's pure rizz right there! Rizzler AI is here for this energy!",
      "You're on fire today! Rizzler AI can feel that magnetic personality!",
      "That's how you do it! Rizzler AI knows you're making all the right moves!",
      "Incredible vibe! Rizzler AI can tell you're really feeling yourself!",
      "You're absolutely glowing! Rizzler AI loves this confident version of you!",
      "That's the secret sauce! Rizzler AI sees you mastering the art of conversation!",
      "You're in the zone! Rizzler AI knows they're completely captivated by you!",
      "That's championship level rizz! Rizzler AI is your biggest fan right now!",
      "You're absolutely magnetic! Rizzler AI can feel that irresistible energy!",
      "That's exactly the move! Rizzler AI knows you're about to seal the deal!",
      "You're speaking pure poetry! Rizzler AI is amazed by your natural flow!",
      "That's legendary status! Rizzler AI knows you're about to be unforgettable!",
    ]

    const randomResponse = rizzlerResponses[Math.floor(Math.random() * rizzlerResponses.length)]

    // Play Rizzler AI response with better voice settings
    if ("speechSynthesis" in window) {
      // Cancel any existing speech
      speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(randomResponse)
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.volume = 0.9

      // Try to use a better voice if available
      const voices = speechSynthesis.getVoices()
      const preferredVoice = voices.find(
        (voice) =>
          voice.name.includes("Google") ||
          voice.name.includes("Microsoft") ||
          voice.name.includes("Alex") ||
          voice.name.includes("Samantha") ||
          voice.name.includes("Daniel") ||
          voice.name.includes("Karen"),
      )
      if (preferredVoice) {
        utterance.voice = preferredVoice
      }

      utterance.onstart = () => {
        addDebugInfo(`🔊 Rizzler AI speaking: ${randomResponse.substring(0, 50)}...`)
      }

      utterance.onend = () => {
        setConversationState("ready")
        setCurrentSuggestion("🚀 Rizzler AI ready for your next line!")
        setCurrentStep("Ready - Listening for Your Voice")
        setResponseCount((prev) => prev + 1)
        setIsSpeaking(false)
        updatePipelineStep("Rizzler Response", "complete", "Response delivered")
        addDebugInfo("✅ Rizzler AI response completed")
      }

      utterance.onerror = (event) => {
        console.error("Rizzler AI speech error:", event)
        setConversationState("ready")
        setCurrentSuggestion("🚀 Rizzler AI ready for your next line!")
        setCurrentStep("Ready - Listening for Your Voice")
        setIsSpeaking(false)
        updatePipelineStep("Rizzler Response", "error", "Speech synthesis failed")
      }

      speechSynthesis.speak(utterance)
      addDebugInfo(`🔊 Rizzler AI response: ${randomResponse}`)
    } else {
      // Fallback if speech synthesis not available
      setConversationState("ready")
      setCurrentSuggestion("🚀 Rizzler AI ready for your next line!")
      setCurrentStep("Ready - Listening for Your Voice")
      setIsSpeaking(false)
      updatePipelineStep("Rizzler Response", "complete", "Response generated (text only)")
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

  const endConversation = () => {
    monitoringRef.current = false
    setIsListening(false)

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

    addDebugInfo(`✅ Rizzler AI session ended. Generated ${responseCount} responses.`)

    if (typeof window !== "undefined") {
      window.location.href = "/"
    }
  }

  const toggleListening = async () => {
    if (!isListening) {
      // Start listening
      try {
        await setupRizzlerAudio()
        startRizzlerListening()
        setIsListening(true)
        setCurrentSuggestion("🎤 Rizzler AI is listening...")
        setCurrentStep("Listening for Your Voice")
        addDebugInfo("🎤 Started listening")
      } catch (error) {
        addDebugInfo(`❌ Failed to start listening: ${error.message}`)
      }
    } else {
      // Stop listening
      monitoringRef.current = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }
      setIsListening(false)
      setCurrentSuggestion("🚀 Rizzler AI ready to listen!")
      setCurrentStep("Ready - Click to Start Listening")
      addDebugInfo("🔇 Stopped listening")
    }
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
        return { text: "🗣️ Rizzler Speaking...", color: "bg-red-500" }
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
              <Brain className="h-6 w-6 text-purple-400" />🔥 Rizzler AI
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
                  className={`w-3 h-3 rounded-full ${isRizzlerConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
                />
                <span className="text-white text-xs">🔥 Rizzler AI</span>
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
              <p className="text-sm text-blue-300 mt-2">🎤 Your Voice → 🔥 Rizzler AI → 🗣️ Instant Coaching</p>
            </div>
          </CardContent>
        </Card>

        {/* Audio Visualizer */}
        <Card className="bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur border-green-300/30">
          <CardHeader>
            <CardTitle className="text-white text-center flex items-center justify-center gap-2">
              <Activity className="h-5 w-5" />🎤 Audio Level Monitor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AudioVisualizer audioLevel={audioLevel} isActive={speechDetected} rawLevel={rawAudioLevel} />
          </CardContent>
        </Card>

        {/* Pipeline Steps */}
        <Card className="bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur border-green-300/30">
          <CardHeader>
            <CardTitle className="text-white text-center flex items-center justify-center gap-2">
              <Activity className="h-5 w-5" />🔥 Rizzler AI Pipeline
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
              <MessageSquare className="h-5 w-5" />🔥 Rizzler AI Responses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {aiResponses.length === 0 ? (
                <div className="text-center py-8">
                  <MessageSquare className="w-12 h-12 text-gray-500 mx-auto mb-3" />
                  <p className="text-gray-400">Rizzler AI responses will appear here after you speak</p>
                </div>
              ) : (
                aiResponses
                  .slice()
                  .reverse()
                  .map((response) => (
                    <div key={response.id} className="p-4 bg-green-900/20 rounded-lg border border-green-500/30">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className="bg-green-600 text-white text-xs">Rizzler AI</Badge>
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
                    <span>{Math.round(rawAudioLevel * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-100"
                      style={{ width: `${Math.min(100, rawAudioLevel * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Speaking Indicator */}
              {isSpeaking && (
                <div className="flex items-center justify-center p-4 bg-blue-600/20 rounded-lg border border-blue-500/30">
                  <Volume2 className="w-6 h-6 text-blue-400 mr-2 animate-pulse" />
                  <span className="text-blue-200 font-medium">Rizzler AI Speaking...</span>
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
