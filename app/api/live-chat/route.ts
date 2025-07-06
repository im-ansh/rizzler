import type { NextRequest } from "next/server"
import { WebSocketServer } from "ws"
import WebSocket from "ws"

// Store WebSocket server instance
let wss: WebSocketServer | null = null

// Simple HTTP endpoint for WebSocket info
export async function GET(request: NextRequest) {
  return new Response("WebSocket endpoint - use WebSocket connection", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.action === "test") {
      return Response.json({
        success: true,
        message: "AI Wingman proxy is working",
        gemini_available: !!process.env.GEMINI_API_KEY,
      })
    }

    return Response.json({ error: "Unknown action" }, { status: 400 })
  } catch (error) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
}

// Handle WebSocket upgrade requests
export async function UPGRADE(request: NextRequest, socket: any, head: any) {
  console.log("🚀 WebSocket upgrade request received")

  try {
    // Initialize WebSocket server if not exists
    if (!wss) {
      console.log("🔧 Initializing WebSocket server...")
      wss = new WebSocketServer({
        noServer: true,
        perMessageDeflate: false,
      })

      wss.on("connection", handleClientConnection)
      console.log("✅ WebSocket server initialized")
    }

    // Handle the upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request)
    })
  } catch (error) {
    console.error("❌ WebSocket upgrade error:", error)
    socket.destroy()
  }
}

/**
 * Handle new client WebSocket connections
 */
function handleClientConnection(clientWs: WebSocket, request: any) {
  console.log("👤 New client connected to AI Wingman")

  let geminiWs: WebSocket | null = null
  let isGeminiConnected = false
  let sessionConfigured = false

  // Validate Gemini API key
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY
  if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in environment variables")
    clientWs.send(
      JSON.stringify({
        type: "error",
        message: "Server configuration error: Missing API key",
      }),
    )
    clientWs.close()
    return
  }

  // Establish connection to Gemini Live API
  function connectToGemini() {
    console.log("🤖 Connecting to Gemini Live API...")

    const geminiUrl = `wss://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`

    try {
      geminiWs = new WebSocket(geminiUrl)

      geminiWs.on("open", handleGeminiOpen)
      geminiWs.on("message", handleGeminiMessage)
      geminiWs.on("close", handleGeminiClose)
      geminiWs.on("error", handleGeminiError)
    } catch (error) {
      console.error("❌ Failed to create Gemini WebSocket connection:", error)
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: "Failed to connect to Gemini Live API",
        }),
      )
    }
  }

  function handleGeminiOpen() {
    console.log("✅ Connected to Gemini Live API")
    isGeminiConnected = true

    // Configure session immediately
    configureGeminiSession()

    // Notify client
    clientWs.send(
      JSON.stringify({
        type: "status",
        message: "Connected to Gemini Live API",
      }),
    )
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
        clientWs.send(
          JSON.stringify({
            type: "status",
            message: "Gemini session ready for audio streaming",
          }),
        )
      }, 1000)
    } catch (error) {
      console.error("❌ Failed to configure Gemini session:", error)
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: "Failed to configure Gemini session",
        }),
      )
    }
  }

  function handleGeminiMessage(data: Buffer) {
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
              clientWs.send(
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

                clientWs.send(
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
        clientWs.send(
          JSON.stringify({
            type: "error",
            message: `Gemini API error: ${message.error.message || "Unknown error"}`,
          }),
        )
      }
    } catch (error) {
      console.error("❌ Error parsing Gemini message:", error)
      console.error("Raw message:", data.toString())
    }
  }

  function handleGeminiClose(code: number, reason: Buffer) {
    console.log(`🔌 Gemini WebSocket closed: ${code} - ${reason}`)
    isGeminiConnected = false
    sessionConfigured = false

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: "status",
          message: "Gemini connection closed",
        }),
      )
    }
  }

  function handleGeminiError(error: Error) {
    console.error("❌ Gemini WebSocket error:", error)
    isGeminiConnected = false

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(
        JSON.stringify({
          type: "error",
          message: `Gemini connection error: ${error.message}`,
        }),
      )
    }
  }

  // Client WebSocket event handlers
  clientWs.on("message", handleClientMessage)
  clientWs.on("close", handleClientClose)
  clientWs.on("error", handleClientError)

  function handleClientMessage(data: Buffer | string) {
    try {
      // Handle binary audio data
      if (data instanceof Buffer) {
        handleClientAudioData(data)
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

        default:
          console.log("⚠️ Unknown message type from client:", message.type)
      }
    } catch (error) {
      console.error("❌ Error handling client message:", error)
    }
  }

  function handleClientAudioData(audioData: Buffer) {
    if (!isGeminiConnected || !sessionConfigured) {
      return // Silently drop audio if not ready
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

      geminiWs?.send(JSON.stringify(audioMessage))
      // console.log(`🎤 Sent ${audioData.length} bytes of audio to Gemini`)
    } catch (error) {
      console.error("❌ Error processing client audio:", error)
    }
  }

  function sendTextToGemini(text: string) {
    if (!isGeminiConnected || !sessionConfigured) {
      return
    }

    try {
      const textMessage = {
        client_content: {
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: text,
                },
              ],
            },
          ],
          turn_complete: true,
        },
      }

      geminiWs?.send(JSON.stringify(textMessage))
      console.log("📝 Sent text to Gemini:", text)
    } catch (error) {
      console.error("❌ Error sending text to Gemini:", error)
    }
  }

  function handleClientClose(code: number, reason: Buffer) {
    console.log(`👤 Client disconnected: ${code} - ${reason}`)

    if (geminiWs && isGeminiConnected) {
      console.log("🔌 Closing Gemini connection due to client disconnect")
      geminiWs.close()
    }
  }

  function handleClientError(error: Error) {
    console.error("❌ Client WebSocket error:", error)

    if (geminiWs && isGeminiConnected) {
      console.log("🔌 Closing Gemini connection due to client error")
      geminiWs.close()
    }
  }

  // Send initial connection message
  clientWs.send(
    JSON.stringify({
      type: "status",
      message: 'Connected to AI Wingman proxy. Send "connect" to establish Gemini connection.',
    }),
  )
}
