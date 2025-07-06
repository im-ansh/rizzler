const { createServer } = require("http")
const { parse } = require("url")
const next = require("next")
const { WebSocketServer } = require("ws")

const dev = process.env.NODE_ENV !== "production"
const hostname = "localhost"
const port = process.env.PORT || 3000
const wsPort = 3001

// Initialize Next.js app
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

  console.log(`🚀 WebSocket server starting on port ${wsPort}`)

  wss.on("connection", (ws, request) => {
    console.log("👤 New WebSocket connection established")

    let geminiWs = null
    let isGeminiConnected = false
    let sessionConfigured = false

    // Validate Gemini API key
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) {
      console.error("❌ GEMINI_API_KEY not found in environment variables")
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Server configuration error: Missing API key",
        }),
      )
      ws.close()
      return
    }

    // Connect to Gemini Live API
    function connectToGemini() {
      console.log("🤖 Connecting to Gemini Live API...")

      const geminiUrl = `wss://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`

      try {
        const WebSocket = require("ws")
        geminiWs = new WebSocket(geminiUrl)

        geminiWs.on("open", () => {
          console.log("✅ Connected to Gemini Live API")
          isGeminiConnected = true

          // Configure session
          configureGeminiSession()

          // Notify client
          ws.send(
            JSON.stringify({
              type: "status",
              message: "Connected to Gemini Live API",
            }),
          )
        })

        geminiWs.on("message", (data) => {
          try {
            const message = JSON.parse(data.toString())
            console.log("📨 Received from Gemini:", JSON.stringify(message, null, 2))

            // Handle different response types
            if (message.candidates && message.candidates[0]) {
              const candidate = message.candidates[0]

              // Handle text responses
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    console.log("📝 Gemini text response:", part.text)
                    ws.send(
                      JSON.stringify({
                        type: "text",
                        data: part.text,
                      }),
                    )
                  }

                  // Handle audio responses
                  if (part.inline_data && part.inline_data.mime_type === "audio/pcm") {
                    console.log("🔊 Gemini audio response received")

                    try {
                      const audioBuffer = Buffer.from(part.inline_data.data, "base64")
                      const uint8Array = Array.from(new Uint8Array(audioBuffer))

                      ws.send(
                        JSON.stringify({
                          type: "audio",
                          data: uint8Array,
                          sampleRate: 24000,
                          encoding: "LINEAR16",
                        }),
                      )

                      console.log(`✅ Sent ${uint8Array.length} bytes of audio to client`)
                    } catch (error) {
                      console.error("❌ Error processing Gemini audio:", error)
                    }
                  }
                }
              }
            }

            // Handle errors
            if (message.error) {
              console.error("❌ Gemini API error:", message.error)
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: `Gemini API error: ${message.error.message || "Unknown error"}`,
                }),
              )
            }
          } catch (error) {
            console.error("❌ Error parsing Gemini message:", error)
          }
        })

        geminiWs.on("close", (code, reason) => {
          console.log(`🔌 Gemini WebSocket closed: ${code} - ${reason}`)
          isGeminiConnected = false
          sessionConfigured = false

          if (ws.readyState === ws.OPEN) {
            ws.send(
              JSON.stringify({
                type: "status",
                message: "Gemini connection closed",
              }),
            )
          }
        })

        geminiWs.on("error", (error) => {
          console.error("❌ Gemini WebSocket error:", error)
          isGeminiConnected = false

          if (ws.readyState === ws.OPEN) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: `Gemini connection error: ${error.message}`,
              }),
            )
          }
        })
      } catch (error) {
        console.error("❌ Failed to create Gemini WebSocket connection:", error)
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Failed to connect to Gemini Live API",
          }),
        )
      }
    }

    function configureGeminiSession() {
      console.log("⚙️ Configuring Gemini session...")

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
          },
          system_instruction: {
            parts: [
              {
                text: "You are a helpful AI wingman assistant. Help users with conversation suggestions for talking to their crush. Be supportive, encouraging, and provide natural, charming responses. Keep responses concise (1-2 sentences) and engaging. Be authentic and help build confidence.",
              },
            ],
          },
        },
      }

      try {
        geminiWs?.send(JSON.stringify(sessionConfig))
        console.log("✅ Session configuration sent to Gemini")
        sessionConfigured = true

        // Notify client that session is ready
        setTimeout(() => {
          ws.send(
            JSON.stringify({
              type: "status",
              message: "Gemini session ready for audio streaming",
            }),
          )
        }, 1000)
      } catch (error) {
        console.error("❌ Failed to configure Gemini session:", error)
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Failed to configure Gemini session",
          }),
        )
      }
    }

    // Handle client messages
    ws.on("message", (data) => {
      try {
        // Handle binary audio data
        if (data instanceof Buffer) {
          if (!isGeminiConnected || !sessionConfigured) {
            return // Silently drop audio if not ready
          }

          try {
            const base64Audio = data.toString("base64")

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

            geminiWs?.send(JSON.stringify(audioMessage))
          } catch (error) {
            console.error("❌ Error processing client audio:", error)
          }
          return
        }

        // Handle JSON messages
        const message = JSON.parse(data.toString())
        console.log("📨 Received from client:", message.type || "unknown")

        switch (message.type) {
          case "connect":
            if (!isGeminiConnected) {
              connectToGemini()
            } else {
              ws.send(
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
              // Handle audio data same as binary
              if (!isGeminiConnected || !sessionConfigured) {
                return
              }

              try {
                const base64Audio = audioBuffer.toString("base64")

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

                geminiWs?.send(JSON.stringify(audioMessage))
              } catch (error) {
                console.error("❌ Error processing client audio:", error)
              }
            }
            break

          case "text":
            if (isGeminiConnected && sessionConfigured && message.data) {
              try {
                const textMessage = {
                  client_content: {
                    turns: [
                      {
                        role: "user",
                        parts: [
                          {
                            text: message.data,
                          },
                        ],
                      },
                    ],
                    turn_complete: true,
                  },
                }

                geminiWs?.send(JSON.stringify(textMessage))
                console.log("📝 Sent text to Gemini:", message.data)
              } catch (error) {
                console.error("❌ Error sending text to Gemini:", error)
              }
            }
            break

          default:
            console.log("⚠️ Unknown message type from client:", message.type)
        }
      } catch (error) {
        console.error("❌ Error handling client message:", error)
      }
    })

    ws.on("close", (code, reason) => {
      console.log(`👤 Client disconnected: ${code} - ${reason}`)

      if (geminiWs && isGeminiConnected) {
        console.log("🔌 Closing Gemini connection due to client disconnect")
        geminiWs.close()
      }
    })

    ws.on("error", (error) => {
      console.error("❌ Client WebSocket error:", error)

      if (geminiWs && isGeminiConnected) {
        console.log("🔌 Closing Gemini connection due to client error")
        geminiWs.close()
      }
    })

    // Send initial connection message
    ws.send(
      JSON.stringify({
        type: "status",
        message: 'Connected to AI Wingman proxy. Send "connect" to establish Gemini connection.',
      }),
    )
  })

  // Start Next.js server
  server.listen(port, (err) => {
    if (err) throw err
    console.log(`🚀 Next.js server ready on http://${hostname}:${port}`)
    console.log(`🔌 WebSocket server ready on ws://${hostname}:${wsPort}`)
  })
})
