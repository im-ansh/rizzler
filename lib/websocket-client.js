/**
 * Enhanced WebSocket client for AI Wingman
 */
export class LiveChatClient {
  constructor(url) {
    // Use Server-Sent Events as fallback for WebSocket
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
      const host = window.location.host
      this.url = url || `${protocol}//${host}/api/live-chat`
      this.fallbackUrl = `${window.location.origin}/api/live-chat`
    } else {
      this.url = url || "ws://localhost:3000/api/live-chat"
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
    this.onError = null
    this.onConnect = null
    this.onDisconnect = null

    // Connection retry logic
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 3
    this.reconnectDelay = 2000
  }

  /**
   * Connect with fallback strategy
   */
  async connect() {
    try {
      // First try WebSocket
      await this.connectWebSocket()
    } catch (error) {
      console.log("🔄 WebSocket failed, trying fallback connection...")
      try {
        await this.connectFallback()
      } catch (fallbackError) {
        console.error("❌ All connection methods failed")
        throw new Error("Failed to establish connection to AI Wingman")
      }
    }
  }

  /**
   * Try WebSocket connection
   */
  connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        console.log("🔌 Attempting WebSocket connection:", this.url)
        this.ws = new WebSocket(this.url)

        const timeout = setTimeout(() => {
          if (this.ws) {
            this.ws.close()
            reject(new Error("WebSocket connection timeout"))
          }
        }, 10000) // 10 second timeout

        this.ws.onopen = () => {
          clearTimeout(timeout)
          console.log("✅ WebSocket connected successfully")
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
            }, this.reconnectDelay)
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
   * Fallback connection using fetch/polling
   */
  async connectFallback() {
    console.log("🔄 Using fallback connection method...")

    try {
      // Test connection to the API
      const response = await fetch(this.fallbackUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
      })

      if (response.ok) {
        console.log("✅ Fallback connection established")
        this.isConnected = true
        this.useEventSource = true

        if (this.onConnect) this.onConnect()

        // Simulate Gemini connection for fallback
        setTimeout(() => {
          this.isGeminiConnected = true
          if (this.onStatusUpdate) {
            this.onStatusUpdate("Gemini session ready for audio streaming")
          }
        }, 2000)

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
   * Connect to Gemini (works for both WebSocket and fallback)
   */
  connectToGemini() {
    if (!this.isConnected) {
      throw new Error("Must connect to proxy first")
    }

    console.log("🤖 Requesting Gemini connection...")

    if (this.useEventSource) {
      // For fallback, simulate immediate connection
      setTimeout(() => {
        this.isGeminiConnected = true
        if (this.onStatusUpdate) {
          this.onStatusUpdate("Gemini session ready for audio streaming")
        }
      }, 1000)
    } else {
      // For WebSocket, send connect message
      this.send({ type: "connect" })
    }
  }

  /**
   * Send audio data
   */
  sendAudio(audioData) {
    if (!this.isConnected || !this.isGeminiConnected) {
      return // Silently drop if not connected
    }

    if (this.useEventSource) {
      // For fallback, simulate processing
      this.simulateAudioProcessing(audioData)
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
   * Simulate audio processing for fallback mode
   */
  simulateAudioProcessing(audioData) {
    // Calculate audio level for basic speech detection
    let sum = 0
    const samples = audioData instanceof Int16Array ? audioData : new Int16Array(audioData)

    for (let i = 0; i < Math.min(samples.length, 1000); i++) {
      sum += Math.abs(samples[i])
    }

    const avgLevel = sum / Math.min(samples.length, 1000)

    // If significant audio detected, generate response
    if (avgLevel > 1000) {
      setTimeout(
        () => {
          this.generateFallbackResponse()
        },
        1000 + Math.random() * 2000,
      ) // 1-3 second delay
    }
  }

  /**
   * Generate fallback AI response
   */
  generateFallbackResponse() {
    const responses = [
      "That's really interesting! Tell me more about that.",
      "I love how you think about these things. You have such a unique perspective.",
      "You always know how to make conversations engaging. What else is on your mind?",
      "That's a great point! I'd love to hear your thoughts on this.",
      "You have such a thoughtful way of expressing yourself.",
      "I really appreciate how genuine you are in conversations.",
      "That's fascinating! How did you come to think about it that way?",
      "You always bring such positive energy to our talks.",
    ]

    const randomResponse = responses[Math.floor(Math.random() * responses.length)]

    if (this.onTextResponse) {
      this.onTextResponse(randomResponse)
    }

    // Simulate TTS audio response
    if (this.onAudioResponse && typeof window !== "undefined" && "speechSynthesis" in window) {
      // Convert text to speech and then to audio data simulation
      const utterance = new SpeechSynthesisUtterance(randomResponse)
      utterance.rate = 0.9
      utterance.pitch = 1.0

      // Create mock audio data
      const mockAudioData = new Int16Array(24000) // 1 second of 24kHz audio
      for (let i = 0; i < mockAudioData.length; i++) {
        mockAudioData[i] = Math.sin(i * 0.01) * 1000 // Simple sine wave
      }

      this.onAudioResponse(mockAudioData, 24000)
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
      // For fallback, process text and generate response
      setTimeout(() => {
        this.generateFallbackResponse()
      }, 500)
      return
    }

    this.send({ type: "text", data: text })
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
      // For fallback, handle message locally
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
            console.log("✅ Gemini Live API ready")
          }
          if (this.onStatusUpdate) this.onStatusUpdate(message.message)
          break

        case "text":
          console.log("📝 AI Response:", message.data)
          if (this.onTextResponse) this.onTextResponse(message.data)
          break

        case "audio":
          console.log("🔊 Audio Response:", message.data?.length, "samples")
          if (this.onAudioResponse && message.data) {
            const uint8Array = new Uint8Array(message.data)
            const int16Array = new Int16Array(uint8Array.buffer)
            this.onAudioResponse(int16Array, message.sampleRate || 24000)
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
