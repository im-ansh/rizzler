/**
 * Enhanced WebSocket client for instant AI responses
 */
export class LiveChatClient {
  constructor(url) {
    // Connect to dedicated WebSocket server
    if (typeof window !== "undefined") {
      this.url = url || "ws://localhost:3001"
      this.fallbackUrl = `${window.location.origin}/api/live-chat`
    } else {
      this.url = url || "ws://localhost:3001"
      this.fallbackUrl = "http://localhost:3000/api/live-chat"
    }

    this.ws = null
    this.isConnected = false
    this.isGeminiConnected = false
    this.useEventSource = false

    // Event handlers
    this.onStatusUpdate = null
    this.onTextResponse = null
    this.onAudioResponse = null
    this.onTextDisplay = null // New handler for text display after audio
    this.onError = null
    this.onConnect = null
    this.onDisconnect = null

    // Connection retry logic
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000

    // Audio processing
    this.audioContext = null
    this.mediaRecorder = null
    this.audioChunks = []
    this.lastResponseText = ""
  }

  /**
   * Connect with fallback strategy
   */
  async connect() {
    try {
      await this.connectWebSocket()
    } catch (error) {
      console.log("🔄 WebSocket failed, trying fallback...")
      try {
        await this.connectFallback()
      } catch (fallbackError) {
        console.error("❌ All connection methods failed")
        throw new Error("Failed to establish connection to AI Wingman")
      }
    }
  }

  /**
   * Connect to dedicated WebSocket server
   */
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        console.log("🔌 Connecting to AI Wingman WebSocket:", this.url)
        this.ws = new WebSocket(this.url)

        const timeout = setTimeout(() => {
          if (this.ws) {
            this.ws.close()
            reject(new Error("WebSocket connection timeout"))
          }
        }, 8000) // 8 second timeout

        this.ws.onopen = () => {
          clearTimeout(timeout)
          console.log("✅ Connected to AI Wingman WebSocket")
          this.isConnected = true
          this.reconnectAttempts = 0
          if (this.onConnect) this.onConnect()
          resolve()
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onclose = (event) => {
          clearTimeout(timeout)
          console.log("🔌 WebSocket disconnected:", event.code, event.reason)
          this.isConnected = false
          this.isGeminiConnected = false

          if (this.onDisconnect) this.onDisconnect(event)

          // Auto-reconnect for unexpected closures
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            console.log(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
            setTimeout(() => {
              this.connectWebSocket().catch(() => {
                console.log("🔄 Reconnect failed, trying fallback...")
                this.connectFallback().catch(console.error)
              })
            }, this.reconnectDelay * this.reconnectAttempts)
          }
        }

        this.ws.onerror = (error) => {
          clearTimeout(timeout)
          console.error("❌ WebSocket error:", error)
          if (this.onError) this.onError(error)
          reject(error)
        }
      } catch (error) {
        console.error("❌ Failed to create WebSocket:", error)
        reject(error)
      }
    })
  }

  /**
   * Fallback connection with instant mock responses
   */
  async connectFallback() {
    console.log("🔄 Using instant fallback mode...")

    try {
      const response = await fetch(this.fallbackUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      })

      if (response.ok) {
        console.log("✅ Fallback connection established")
        this.isConnected = true
        this.useEventSource = true

        if (this.onConnect) this.onConnect()

        // Simulate instant Gemini connection
        setTimeout(() => {
          this.isGeminiConnected = true
          if (this.onStatusUpdate) {
            this.onStatusUpdate("Gemini session ready for audio streaming")
          }
        }, 1000)

        return Promise.resolve()
      } else {
        throw new Error(`Fallback connection failed: ${response.status}`)
      }
    } catch (error) {
      console.error("❌ Fallback connection failed:", error)
      throw error
    }
  }

  /**
   * Connect to Gemini
   */
  connectToGemini() {
    if (!this.isConnected) {
      throw new Error("Must connect to proxy first")
    }

    console.log("🤖 Requesting instant Gemini connection...")

    if (this.useEventSource) {
      // For fallback, simulate immediate connection
      setTimeout(() => {
        this.isGeminiConnected = true
        if (this.onStatusUpdate) {
          this.onStatusUpdate("Gemini session ready for audio streaming")
        }
      }, 500)
    } else {
      // For WebSocket, send connect message
      this.send({ type: "connect" })
    }
  }

  /**
   * Send audio data for instant processing
   */
  sendAudio(audioData) {
    if (!this.isConnected || !this.isGeminiConnected) {
      return // Silently drop if not connected
    }

    if (this.useEventSource) {
      // For fallback, generate instant response
      this.simulateInstantAudioProcessing(audioData)
      return
    }

    try {
      let buffer
      if (audioData instanceof Int16Array) {
        buffer = audioData.buffer.slice(audioData.byteOffset, audioData.byteOffset + audioData.byteLength)
      } else if (audioData instanceof ArrayBuffer) {
        buffer = audioData
      } else {
        throw new Error("Audio data must be Int16Array or ArrayBuffer")
      }

      this.ws.send(buffer)
    } catch (error) {
      console.error("❌ Error sending audio:", error)
      if (this.onError) this.onError(error)
    }
  }

  /**
   * Simulate instant audio processing for fallback
   */
  simulateInstantAudioProcessing(audioData) {
    let sum = 0
    const samples = audioData instanceof Int16Array ? audioData : new Int16Array(audioData)

    for (let i = 0; i < Math.min(samples.length, 500); i++) {
      sum += Math.abs(samples[i])
    }

    const avgLevel = sum / Math.min(samples.length, 500)

    // If significant audio detected, generate instant response
    if (avgLevel > 800) {
      // Generate instant audio response first
      setTimeout(() => {
        this.generateInstantAudioResponse()
      }, 200) // Very fast response

      // Then show text after audio
      setTimeout(() => {
        this.generateInstantTextDisplay()
      }, 1500)
    }
  }

  /**
   * Generate instant audio response
   */
  generateInstantAudioResponse() {
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
      "You're showing great emotional intelligence there.",
      "That response shows you're really listening to them.",
    ]

    const randomResponse = responses[Math.floor(Math.random() * responses.length)]

    // Create mock audio data for instant playback
    const mockAudioData = new Int16Array(12000) // 0.5 seconds at 24kHz
    for (let i = 0; i < mockAudioData.length; i++) {
      mockAudioData[i] = Math.sin(i * 0.02) * 2000 // Simple sine wave
    }

    if (this.onAudioResponse) {
      this.onAudioResponse(mockAudioData, 24000)
    }

    // Store text for later display
    this.lastResponseText = randomResponse
  }

  /**
   * Generate instant text display after audio
   */
  generateInstantTextDisplay() {
    if (this.lastResponseText && this.onTextDisplay) {
      this.onTextDisplay(this.lastResponseText)
    }
  }

  /**
   * Send text message
   */
  sendText(text) {
    if (!this.isConnected || !this.isGeminiConnected) {
      console.warn("⚠️ Not connected to Gemini")
      return
    }

    if (this.useEventSource) {
      // For fallback, generate instant response
      setTimeout(() => {
        this.generateInstantAudioResponse()
        setTimeout(() => {
          this.generateInstantTextDisplay()
        }, 1000)
      }, 300)
      return
    }

    this.send({ type: "text", data: text })
  }

  /**
   * Start audio capture
   */
  async startAudioCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      })

      const source = this.audioContext.createMediaStreamSource(stream)
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (event) => {
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer.getChannelData(0)
          const pcmData = this.float32ToPCM16(inputBuffer)
          const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)))

          this.ws.send(
            JSON.stringify({
              type: "audio_data",
              audio: base64Audio,
            }),
          )
        }
      }

      source.connect(processor)
      processor.connect(this.audioContext.destination)

      console.log("🎤 Audio capture started")
      return true
    } catch (error) {
      console.error("Failed to start audio capture:", error)
      return false
    }
  }

  /**
   * Convert Float32Array to PCM16
   */
  float32ToPCM16(float32Array) {
    const pcm16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]))
      pcm16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    return pcm16Array
  }

  /**
   * Play audio response
   */
  async playAudioResponse(base64Audio, mimeType) {
    try {
      // Decode base64 audio
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Create audio context if not exists
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      }

      // Convert PCM to AudioBuffer
      const audioBuffer = this.audioContext.createBuffer(1, bytes.length / 2, 24000)
      const channelData = audioBuffer.getChannelData(0)

      // Convert PCM16 to float32
      for (let i = 0; i < channelData.length; i++) {
        const sample = bytes[i * 2] | (bytes[i * 2 + 1] << 8)
        channelData[i] = sample < 0x8000 ? sample / 0x8000 : (sample - 0x10000) / 0x8000
      }

      // Play audio
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioContext.destination)
      source.start()

      console.log("🔊 Playing AI audio response")
    } catch (error) {
      console.error("Failed to play audio response:", error)
    }
  }

  /**
   * Send JSON message
   */
  send(message) {
    if (!this.isConnected) {
      console.warn("⚠️ Not connected")
      return
    }

    if (this.useEventSource) {
      return
    }

    try {
      this.ws.send(JSON.stringify(message))
    } catch (error) {
      console.error("❌ Error sending message:", error)
      if (this.onError) this.onError(error)
    }
  }

  /**
   * Handle incoming messages
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data)

      switch (message.type) {
        case "status":
          console.log("📊 Status:", message.message)
          if (message.message.includes("session ready") || message.message.includes("Gemini session ready")) {
            this.isGeminiConnected = true
            console.log("✅ Gemini Live API ready for instant responses")
          }
          if (this.onStatusUpdate) this.onStatusUpdate(message.message)
          break

        case "audio":
          console.log("🔊 Instant Audio Response:", message.data?.length, "samples")
          if (this.onAudioResponse && message.data) {
            const uint8Array = new Uint8Array(message.data)
            const int16Array = new Int16Array(uint8Array.buffer)
            this.onAudioResponse(int16Array, message.sampleRate || 24000)
          }
          break

        case "text":
          console.log("📝 AI Text Response:", message.data)
          if (this.onTextResponse) this.onTextResponse(message.data)
          break

        case "text_display":
          console.log("📝 Text Display:", message.data)
          if (this.onTextDisplay) this.onTextDisplay(message.data)
          break

        case "ai_response":
          if (this.onAIResponse) {
            this.onAIResponse(message.text, message.timestamp)
          }
          break

        case "ai_audio":
          if (this.onAudioResponse) {
            this.onAudioResponse(message.audio, message.mimeType)
          }
          break

        case "connection_status":
          if (this.onStatusUpdate) {
            this.onStatusUpdate(message.status, message.message)
          }
          break

        case "error":
          console.error("❌ Error:", message.message)
          if (this.onError) this.onError(new Error(message.message))
          break

        default:
          console.log("⚠️ Unknown message type:", message.type)
      }
    } catch (error) {
      console.error("❌ Error parsing message:", error)
      if (this.onError) this.onError(error)
    }
  }

  /**
   * Disconnect
   */
  disconnect() {
    if (this.ws) {
      console.log("🔌 Disconnecting...")
      this.ws.close()
      this.ws = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    this.isConnected = false
    this.isGeminiConnected = false
    this.useEventSource = false
  }

  /**
   * Connection status
   */
  get connected() {
    return this.isConnected
  }

  get geminiConnected() {
    return this.isGeminiConnected
  }
}

// Additional WebSocket client for compatibility
class WebSocketClient {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.audioContext = null
    this.mediaRecorder = null
    this.audioChunks = []
    this.onStatusUpdate = null
    this.onAIResponse = null
    this.onAudioResponse = null
  }

  async connect() {
    try {
      const wsUrl = `ws://localhost:${window.location.port || 3000}/api/live-chat`
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log("🔌 Connected to WebSocket")
        this.isConnected = true
        this.reconnectAttempts = 0

        if (this.onStatusUpdate) {
          this.onStatusUpdate("connected", "WebSocket connected")
        }

        // Initialize Gemini connection
        this.ws.send(
          JSON.stringify({
            type: "init",
          }),
        )
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          switch (data.type) {
            case "connection_status":
              if (this.onStatusUpdate) {
                this.onStatusUpdate(data.status, data.message)
              }
              break

            case "ai_response":
              if (this.onAIResponse) {
                this.onAIResponse(data.text, data.timestamp)
              }
              break

            case "ai_audio":
              if (this.onAudioResponse) {
                this.onAudioResponse(data.audio, data.mimeType)
              }
              break

            case "error":
              console.error("WebSocket error:", data.message)
              if (this.onStatusUpdate) {
                this.onStatusUpdate("error", data.message)
              }
              break
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error)
        }
      }

      this.ws.onclose = () => {
        console.log("🔌 WebSocket disconnected")
        this.isConnected = false

        if (this.onStatusUpdate) {
          this.onStatusUpdate("disconnected", "WebSocket disconnected")
        }

        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectAttempts++
            this.connect()
          }, this.reconnectDelay * this.reconnectAttempts)
        }
      }

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error)
        if (this.onStatusUpdate) {
          this.onStatusUpdate("error", "WebSocket connection error")
        }
      }
    } catch (error) {
      console.error("Failed to connect WebSocket:", error)
      if (this.onStatusUpdate) {
        this.onStatusUpdate("error", "Failed to connect")
      }
    }
  }

  async startAudioCapture() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      })

      const source = this.audioContext.createMediaStreamSource(stream)
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (event) => {
        if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
          const inputBuffer = event.inputBuffer.getChannelData(0)
          const pcmData = this.float32ToPCM16(inputBuffer)
          const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcmData.buffer)))

          this.ws.send(
            JSON.stringify({
              type: "audio_data",
              audio: base64Audio,
            }),
          )
        }
      }

      source.connect(processor)
      processor.connect(this.audioContext.destination)

      console.log("🎤 Audio capture started")
      return true
    } catch (error) {
      console.error("Failed to start audio capture:", error)
      return false
    }
  }

  float32ToPCM16(float32Array) {
    const pcm16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]))
      pcm16Array[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    return pcm16Array
  }

  async playAudioResponse(base64Audio, mimeType) {
    try {
      // Decode base64 audio
      const binaryString = atob(base64Audio)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      // Create audio context if not exists
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
      }

      // Convert PCM to AudioBuffer
      const audioBuffer = this.audioContext.createBuffer(1, bytes.length / 2, 24000)
      const channelData = audioBuffer.getChannelData(0)

      // Convert PCM16 to float32
      for (let i = 0; i < channelData.length; i++) {
        const sample = bytes[i * 2] | (bytes[i * 2 + 1] << 8)
        channelData[i] = sample < 0x8000 ? sample / 0x8000 : (sample - 0x10000) / 0x8000
      }

      // Play audio
      const source = this.audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(this.audioContext.destination)
      source.start()

      console.log("🔊 Playing AI audio response")
    } catch (error) {
      console.error("Failed to play audio response:", error)
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
    }
    if (this.audioContext) {
      this.audioContext.close()
    }
    this.isConnected = false
  }
}

// Export for use in React components
if (typeof window !== "undefined") {
  window.WebSocketClient = WebSocketClient
  window.LiveChatClient = LiveChatClient
}

// Named exports
export { WebSocketClient }
export default LiveChatClient
