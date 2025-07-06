const { createServer } = require("http")
const { parse } = require("url")
const next = require("next")
const { WebSocketServer } = require("ws")
const WebSocket = require("ws")

const dev = process.env.NODE_ENV !== "production"
const hostname = "localhost"
const port = process.env.PORT || 3000
const wsPort = 3001

// Initialize Next.js
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  // Create HTTP server for Next.js
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      await handle(req, res, parsedUrl)
    } catch (err) {
      console.error("Error occurred handling", req.url, err)
      res.statusCode = 500
      res.end("internal server error")
    }
  })

  // Create WebSocket server on separate port
  const wss = new WebSocketServer({
    port: wsPort,
    perMessageDeflate: false,
  })

  console.log(`🚀 Next.js server starting on http://${hostname}:${port}`)
  console.log(`🔌 WebSocket server starting on ws://${hostname}:${wsPort}`)

  wss.on("connection", (clientWs, request) => {
    console.log("👤 New AI Wingman client connected")

    let geminiWs = null
    let isGeminiConnected = false
    let sessionConfigured = false
    let conversationContext = []

    // Validate Gemini API key
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY not found")
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: "Server configuration error: Missing Gemini API key",
        }),
      )
      clientWs.close()
      return
    }

    // Connect to Gemini Live API
    function connectToGemini() {
      console.log("🤖 Connecting to Gemini Live API...")

      const geminiUrl = `wss://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`

      try {
        geminiWs = new WebSocket(geminiUrl)

        geminiWs.on("open", () => {
          console.log("✅ Connected to Gemini Live API")
          isGeminiConnected = true
          configureGeminiSession()

          clientWs.send(
            JSON.stringify({
              type: "status",
              message: "Connected to Gemini Live API",
            }),
          )
        })

        geminiWs.on("message", handleGeminiMessage)
        geminiWs.on("close", handleGeminiClose)
        geminiWs.on("error", handleGeminiError)
      } catch (error) {
        console.error("❌ Failed to connect to Gemini:", error)
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: "Failed to connect to Gemini Live API",
          }),
        )
      }
    }

    function configureGeminiSession() {
      console.log("⚙️ Configuring Gemini session for instant responses...")

      const sessionConfig = {
        setup: {
          model: "models/gemini-2.0-flash-exp",
          generation_config: {
            response_modalities: ["AUDIO", "TEXT"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: "Aoede",
                },
              },
            },
            temperature: 0.8,
            max_output_tokens: 150, // Keep responses concise for speed
          },
          system_instruction: {
            parts: [
              {
                text: `You are an AI wingman helping with real-time conversation coaching. 

CRITICAL INSTRUCTIONS:
- Generate INSTANT responses (1-2 sentences max)
- Be supportive, charming, and confidence-building
- Provide natural conversation suggestions
- Match the energy and tone of the conversation
- Help the user sound authentic and engaging
- Respond immediately without hesitation

Examples:
User says: "Hey, how's your day going?"
You respond: "That's such a warm way to start! You could follow up with something personal like asking about their weekend plans or mentioning something interesting from your day."

Keep responses SHORT, ACTIONABLE, and INSTANT!`,
              },
            ],
          },
        },
      }

      try {
        geminiWs.send(JSON.stringify(sessionConfig))
        console.log("✅ Gemini session configured for instant responses")
        sessionConfigured = true

        setTimeout(() => {
          clientWs.send(
            JSON.stringify({
              type: "status",
              message: "Gemini session ready for audio streaming",
            }),
          )
        }, 500)
      } catch (error) {
        console.error("❌ Failed to configure Gemini session:", error)
      }
    }

    function handleGeminiMessage(data) {
      try {
        const message = JSON.parse(data.toString())

        if (message.candidates && message.candidates[0]) {
          const candidate = message.candidates[0]

          if (candidate.content && candidate.content.parts) {
            for (const part of candidate.content.parts) {
              // Handle text responses - send immediately for display after audio
              if (part.text) {
                console.log("📝 Gemini text response:", part.text)

                // Store for later display (after audio)
                setTimeout(() => {
                  clientWs.send(
                    JSON.stringify({
                      type: "text_display",
                      data: part.text,
                    }),
                  )
                }, 2000) // Show text after audio starts
              }

              // Handle audio responses - prioritize these for instant playback
              if (part.inline_data && part.inline_data.mime_type === "audio/pcm") {
                console.log("🔊 Gemini audio response - playing instantly")

                try {
                  const audioBuffer = Buffer.from(part.inline_data.data, "base64")
                  const uint8Array = Array.from(new Uint8Array(audioBuffer))

                  // Send audio immediately for instant playback
                  clientWs.send(
                    JSON.stringify({
                      type: "audio",
                      data: uint8Array,
                      sampleRate: 24000,
                      encoding: "LINEAR16",
                    }),
                  )

                  console.log(`✅ Instant audio sent: ${uint8Array.length} bytes`)
                } catch (error) {
                  console.error("❌ Error processing audio:", error)
                }
              }
            }
          }
        }

        if (message.error) {
          console.error("❌ Gemini API error:", message.error)
          clientWs.send(
            JSON.stringify({
              type: "error",
              message: `Gemini error: ${message.error.message || "Unknown error"}`,
            }),
          )
        }
      } catch (error) {
        console.error("❌ Error parsing Gemini message:", error)
      }
    }

    function handleGeminiClose(code, reason) {
      console.log(`🔌 Gemini connection closed: ${code} - ${reason}`)
      isGeminiConnected = false
      sessionConfigured = false

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: "status",
            message: "Gemini connection closed - attempting reconnect...",
          }),
        )

        // Auto-reconnect after 2 seconds
        setTimeout(connectToGemini, 2000)
      }
    }

    function handleGeminiError(error) {
      console.error("❌ Gemini WebSocket error:", error)
      isGeminiConnected = false
    }

    // Client message handlers
    clientWs.on("message", (data) => {
      try {
        // Handle binary audio data
        if (data instanceof Buffer && data.length > 100) {
          handleClientAudioData(data)
          return
        }

        // Handle JSON messages
        const message = JSON.parse(data.toString())

        switch (message.type) {
          case "connect":
            if (!isGeminiConnected) {
              connectToGemini()
            } else {
              clientWs.send(
                JSON.stringify({
                  type: "status",
                  message: "Already connected to Gemini",
                }),
              )
            }
            break

          case "audio":
            if (message.data && Array.isArray(message.data)) {
              const audioBuffer = Buffer.from(message.data)
              handleClientAudioData(audioBuffer)
            }
            break

          case "text":
            if (isGeminiConnected && sessionConfigured && message.data) {
              sendTextToGemini(message.data)
            }
            break
        }
      } catch (error) {
        console.error("❌ Error handling client message:", error)
      }
    })

    function handleClientAudioData(audioData) {
      if (!isGeminiConnected || !sessionConfigured) {
        return
      }

      try {
        const base64Audio = audioData.toString("base64")

        const audioMessage = {
          realtime_input: {
            media_chunks: [
              {
                mime_type: "audio/pcm",
                data: base64Audio,
              },
            ],
          },
        }

        geminiWs.send(JSON.stringify(audioMessage))
      } catch (error) {
        console.error("❌ Error processing client audio:", error)
      }
    }

    function sendTextToGemini(text) {
      if (!isGeminiConnected || !sessionConfigured) {
        return
      }

      try {
        // Add to conversation context
        conversationContext.push({
          role: "user",
          parts: [{ text: text }],
        })

        // Keep only last 4 exchanges for speed
        if (conversationContext.length > 8) {
          conversationContext = conversationContext.slice(-8)
        }

        const textMessage = {
          client_content: {
            turns: conversationContext,
            turn_complete: true,
          },
        }

        geminiWs.send(JSON.stringify(textMessage))
        console.log("📝 Sent text to Gemini for instant response")
      } catch (error) {
        console.error("❌ Error sending text to Gemini:", error)
      }
    }

    clientWs.on("close", (code, reason) => {
      console.log(`👤 Client disconnected: ${code} - ${reason}`)
      if (geminiWs && isGeminiConnected) {
        geminiWs.close()
      }
    })

    clientWs.on("error", (error) => {
      console.error("❌ Client WebSocket error:", error)
    })

    // Send initial connection message
    clientWs.send(
      JSON.stringify({
        type: "status",
        message: 'Connected to AI Wingman. Send "connect" to start Gemini Live API.',
      }),
    )
  })

  // Start Next.js server
  server.listen(port, (err) => {
    if (err) throw err
    console.log(`✅ Next.js ready on http://${hostname}:${port}`)
    console.log(`✅ WebSocket ready on ws://${hostname}:${wsPort}`)
    console.log(`🤖 AI Wingman system ready for instant responses!`)
  })
})
