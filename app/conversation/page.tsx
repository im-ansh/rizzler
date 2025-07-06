"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Phone, ArrowLeft, Mic, MicOff, Brain, Volume2 } from "lucide-react"
import { LiveChatClient } from "@/lib/websocket-client"

type ConversationState = "initializing" | "listening" | "processing" | "generating" | "speaking" | "ready" | "error"

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
  const [lastTranscription, setLastTranscription] = useState("")
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
  const [currentAudioText, setCurrentAudioText] = useState("")
  const [isGeminiConnected, setIsGeminiConnected] = useState(false)

  // Audio processing refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
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
      initializeAIWingman()
    }
  }, [])

  const initializeAIWingman = async () => {
    try {
      addPipelineStep("AI Wingman Init", "processing", "Starting complete AI system")
      setCurrentSuggestion("🤖 Initializing AI Wingman with live response generation...")
      setCurrentStep("Setting up AI Pipeline")

      // STEP 1: Initialize WebSocket connection to Gemini Live
      addPipelineStep("Gemini Live Connection", "processing", "Connecting to Gemini Live API")
      await initializeGeminiLive()

      // STEP 2: Setup microphone for real-time streaming
      addPipelineStep("Microphone Setup", "processing", "Setting up real-time audio streaming")
      await setupRealtimeAudio()

      // STEP 3: Setup speaker for AI responses
      addPipelineStep("Speaker Setup", "processing", "Testing audio output")
      await setupSpeakerOutput()

      // STEP 4: Start real-time monitoring
      addPipelineStep("Real-time Monitoring", "processing", "Starting speech detection")
      startRealtimeMonitoring()

      // System Ready!
      addPipelineStep("AI Wingman Ready", "complete", "All systems operational")
      setConversationState("ready")
      setIsListening(true)
      setCurrentSuggestion("🚀 AI Wingman Ready! Start talking and I'll generate instant responses!")
      setCurrentStep("Ready - Listening & Responding")

      addDebugInfo("✅ Complete AI Wingman system initialized")
    } catch (error: any) {
      console.error("AI Wingman initialization error:", error)
      addPipelineStep("Initialization Failed", "error", error.message)
      setConversationState("error")
      setCurrentSuggestion(`❌ Setup Error: ${error.message}`)
    }
  }

  const initializeGeminiLive = async () => {
    try {
      // Create WebSocket client
      liveChatClientRef.current = new LiveChatClient()

      // Set up event handlers
      liveChatClientRef.current.onStatusUpdate = (status) => {
        addDebugInfo(`🤖 Gemini Status: ${status}`)
        if (status.includes("session ready")) {
          setIsGeminiConnected(true)
          updatePipelineStep("Gemini Live Connection", "complete", "Connected and configured")
        }
      }

      liveChatClientRef.current.onTextResponse = (text) => {
        addDebugInfo(`📝 Gemini Text: ${text}`)
        handleGeminiTextResponse(text)
      }

      liveChatClientRef.current.onAudioResponse = (audioData, sampleRate) => {
        addDebugInfo(`🔊 Gemini Audio: ${audioData.length} samples at ${sampleRate}Hz`)
        handleGeminiAudioResponse(audioData, sampleRate)
      }

      liveChatClientRef.current.onError = (error) => {
        addDebugInfo(`❌ Gemini Error: ${error.message}`)
        setIsGeminiConnected(false)
      }

      liveChatClientRef.current.onConnect = () => {
        addDebugInfo("✅ Connected to live chat proxy")
      }

      liveChatClientRef.current.onDisconnect = () => {
        addDebugInfo("🔌 Disconnected from live chat proxy")
        setIsGeminiConnected(false)
      }

      // Connect to proxy and then to Gemini
      await liveChatClientRef.current.connect()
      liveChatClientRef.current.connectToGemini()

      addDebugInfo("✅ Gemini Live API connection initiated")
    } catch (error) {
      throw new Error(`Failed to connect to Gemini Live: ${error.message}`)
    }
  }

  const setupRealtimeAudio = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000, // Gemini expects 16kHz
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      streamRef.current = stream
      setMicrophoneStatus("granted")

      // Setup audio context for real-time processing
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      audioContextRef.current = new AudioContextClass({ sampleRate: 16000 })

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }

      // Setup analyser for visual feedback
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 512
      analyserRef.current.smoothingTimeConstant = 0.3

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      // Setup real-time audio processing
      await setupAudioWorklet(source)

      updatePipelineStep("Microphone Setup", "complete", "Real-time audio streaming ready")
      addDebugInfo("✅ Real-time audio setup complete")
    } catch (error) {
      throw new Error(`Microphone setup failed: ${error.message}`)
    }
  }

  const setupAudioWorklet = async (source: MediaStreamAudioSourceNode) => {
    try {
      // Create a ScriptProcessorNode for real-time audio processing
      // (AudioWorklet would be better but ScriptProcessor is more compatible)
      const processor = audioContextRef.current!.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (event) => {
        if (!isStreamingRef.current || !liveChatClientRef.current?.geminiConnected) {
          return
        }

        const inputBuffer = event.inputBuffer
        const inputData = inputBuffer.getChannelData(0)

        // Convert Float32Array to Int16Array for Gemini
        const int16Data = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768))
        }

        // Send to Gemini Live API
        try {
          liveChatClientRef.current?.sendAudio(int16Data)
        } catch (error) {
          console.error("Error sending audio to Gemini:", error)
        }
      }

      source.connect(processor)
      processor.connect(audioContextRef.current!.destination)

      audioWorkletRef.current = processor as any
      addDebugInfo("✅ Audio worklet setup complete")
    } catch (error) {
      addDebugInfo(`⚠️ Audio worklet setup failed: ${error.message}`)
    }
  }

  const setupSpeakerOutput = async () => {
    try {
      if ("speechSynthesis" in window) {
        setSpeakerStatus("granted")
        updatePipelineStep("Speaker Setup", "complete", "Audio output ready")
        addDebugInfo("✅ Speaker output ready")
      } else {
        setSpeakerStatus("error")
        updatePipelineStep("Speaker Setup", "error", "Speech synthesis not supported")
      }
    } catch (error) {
      setSpeakerStatus("error")
      throw new Error(`Speaker setup failed: ${error.message}`)
    }
  }

  const startRealtimeMonitoring = () => {
    if (!analyserRef.current) return

    monitoringRef.current = true
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

    const checkAudioLevel = () => {
      if (!analyserRef.current || !monitoringRef.current) return

      try {
        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate audio level for visualization
        let sum = 0
        for (let i = 0; i < dataArray.length; i += 2) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / (dataArray.length / 2))
        const normalizedLevel = rms / 255

        setRawAudioLevel(normalizedLevel)
        setAudioLevel((prev) => prev * 0.7 + normalizedLevel * 0.3)

        // Speech detection for visual feedback
        const speechThreshold = 0.015
        const isSpeaking = normalizedLevel > speechThreshold

        if (isSpeaking && !speechDetected) {
          setSpeechDetected(true)
          setConversationState("listening")
          setCurrentSuggestion("🎤 Listening and processing with AI...")
          setCurrentStep("Live Audio Processing")

          // Start streaming to Gemini
          if (!isStreamingRef.current && liveChatClientRef.current?.geminiConnected) {
            isStreamingRef.current = true
            addDebugInfo("🎤 Started streaming audio to Gemini")
          }
        } else if (!isSpeaking && speechDetected) {
          // Brief pause in speech
          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              setSpeechDetected(false)
              setConversationState("processing")
              setCurrentSuggestion("🤖 AI processing your speech...")
              setCurrentStep("Generating Response")

              // Stop streaming
              isStreamingRef.current = false
              addDebugInfo("🤫 Stopped streaming audio to Gemini")

              silenceTimeoutRef.current = null
            }, 1500)
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
    updatePipelineStep("Real-time Monitoring", "complete", "Speech detection active")
  }

  const handleGeminiTextResponse = (text: string) => {
    addPipelineStep("Text Response", "complete", `"${text.substring(0, 50)}..."`)
    setLastTranscription(text)
    setCurrentAudioText(text)

    // Add to conversation history
    setConversationHistory((prev) => [
      ...prev.slice(-8),
      {
        speaker: "ai",
        text: text,
        timestamp: Date.now(),
        confidence: 0.95,
      },
    ])

    // Speak the response using browser TTS as backup
    speakResponse(text)
  }

  const handleGeminiAudioResponse = (audioData: Int16Array, sampleRate: number) => {
    addPipelineStep("Audio Response", "processing", `Playing ${audioData.length} samples`)
    setConversationState("speaking")
    setCurrentStep("AI Speaking Response")

    try {
      // Play the audio response from Gemini
      playAudioResponse(audioData, sampleRate)
      updatePipelineStep("Audio Response", "complete", "Audio playback started")
    } catch (error) {
      addDebugInfo(`❌ Audio playback error: ${error.message}`)
      updatePipelineStep("Audio Response", "error", "Audio playback failed")
    }
  }

  const playAudioResponse = (audioData: Int16Array, sampleRate: number) => {
    try {
      if (!audioContextRef.current) return

      // Create audio buffer
      const audioBuffer = audioContextRef.current.createBuffer(1, audioData.length, sampleRate)
      const channelData = audioBuffer.getChannelData(0)

      // Convert Int16Array to Float32Array
      for (let i = 0; i < audioData.length; i++) {
        channelData[i] = audioData[i] / 32768
      }

      // Create and play audio source
      const source = audioContextRef.current.createBufferSource()
      source.buffer = audioBuffer
      source.connect(audioContextRef.current.destination)

      source.onended = () => {
        addDebugInfo("✅ AI audio response finished")
        setConversationState("ready")
        setCurrentSuggestion("🚀 Ready for your next line!")
        setCurrentStep("Ready - Listening & Responding")
        setCurrentAudioText("")
        setResponseCount((prev) => prev + 1)
      }

      source.start()
      addDebugInfo(`🔊 Playing AI audio response: ${audioData.length} samples at ${sampleRate}Hz`)
    } catch (error) {
      addDebugInfo(`❌ Audio playback error: ${error.message}`)
      // Fallback to ready state
      setConversationState("ready")
      setCurrentSuggestion("🚀 Ready for your next line!")
      setCurrentStep("Ready - Listening & Responding")
    }
  }

  const speakResponse = (text: string) => {
    // Backup TTS using browser speech synthesis
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.9
      utterance.pitch = 1.0
      utterance.volume = 0.8

      utterance.onstart = () => {
        setConversationState("speaking")
        setCurrentStep("AI Speaking (TTS)")
      }

      utterance.onend = () => {
        setConversationState("ready")
        setCurrentSuggestion("🚀 Ready for your next line!")
        setCurrentStep("Ready - Listening & Responding")
        setCurrentAudioText("")
        setResponseCount((prev) => prev + 1)
      }

      utterance.onerror = () => {
        setConversationState("ready")
        setCurrentSuggestion("🚀 Ready for your next line!")
        setCurrentStep("Ready - Listening & Responding")
      }

      // Small delay to let Gemini audio play first
      setTimeout(() => {
        if (conversationState === "speaking") {
          speechSynthesis.speak(utterance)
        }
      }, 500)
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

    addDebugInfo(`✅ Session ended. Generated ${responseCount} AI responses.`)

    if (typeof window !== "undefined") {
      window.location.href = "/"
    }
  }

  const getStateDisplay = () => {
    switch (conversationState) {
      case "initializing":
        return { text: "🤖 Initializing...", color: "bg-blue-500" }
      case "ready":
        return { text: "🚀 Ready!", color: "bg-green-500" }
      case "listening":
        return { text: "🎤 Listening...", color: "bg-yellow-500" }
      case "processing":
        return { text: "⚡ Processing...", color: "bg-orange-500" }
      case "generating":
        return { text: "🧠 Generating...", color: "bg-purple-500" }
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
              <Brain className="h-6 w-6 text-purple-400" />🤖 AI Wingman Live
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
                <span className="text-white text-xs">🤖 Gemini</span>
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
              <p className="text-sm text-blue-300 mt-2">🎤 Real-time Audio → 🤖 Gemini Live API → 🔊 AI Response</p>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Steps */}
        <Card className="bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur border-green-300/30">
          <CardHeader>
            <CardTitle className="text-white text-center flex items-center justify-center gap-2">
              <Activity className="h-5 w-5" />🤖 Live AI Pipeline
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

        {/* Current AI Response */}
        {currentAudioText && (
          <Card className="bg-gradient-to-r from-pink-500/20 to-red-500/20 backdrop-blur border-pink-300/30">
            <CardHeader>
              <CardTitle className="text-white text-center flex items-center justify-center gap-2">
                <Volume2 className="h-5 w-5 animate-pulse" />🤖 AI Response
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <div className="bg-white/10 rounded-lg p-4">
                  <p className="text-lg font-medium text-white leading-relaxed">"{currentAudioText}"</p>
                </div>
                <div className="flex items-center justify-center gap-2 text-pink-300 mt-3">
                  <Volume2 className="h-4 w-4 animate-pulse" />
                  <span className="text-sm">🔊 AI speaking response...</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Status Display */}
        <Card className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 backdrop-blur border-purple-300/30">
          <CardHeader>
            <CardTitle className="text-white text-center flex items-center justify-center gap-2">
              <Brain className="h-5 w-5" />🚀 AI Wingman Status
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
              <h3 className="text-white font-semibold">🎤 Live Audio Stream</h3>
              <AudioVisualizer audioLevel={audioLevel} isActive={speechDetected} rawLevel={rawAudioLevel} />
              <div className="text-xs text-gray-400">
                {isGeminiConnected ? "🤖 Streaming to Gemini Live API" : "⚠️ Waiting for Gemini connection"}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Conversation History */}
        {conversationHistory.length > 0 && (
          <Card className="bg-white/5 backdrop-blur border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-sm">💬 AI Responses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {conversationHistory.slice(-4).map((entry, index) => (
                  <div key={index} className="text-sm">
                    <span className="font-semibold text-purple-300">🤖 AI Wingman:</span>
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
              <h3 className="text-yellow-200 font-semibold">🤖 Live AI Wingman System</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-yellow-100">Real-time Audio</p>
                  <p className="text-xs text-yellow-200">16kHz streaming</p>
                </div>
                <div>
                  <p className="text-yellow-100">Gemini Live API</p>
                  <p className="text-xs text-yellow-200">Instant responses</p>
                </div>
                <div>
                  <p className="text-yellow-100">AI Audio Output</p>
                  <p className="text-xs text-yellow-200">24kHz playback</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
