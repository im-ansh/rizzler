import { type NextRequest, NextResponse } from "next/server"

const GEMINI_API_KEY = "AIzaSyBA5rbBeqJGYrZsQkk8OJ47099LRcMQzQo"

export async function POST(request: NextRequest) {
  try {
    const { action, audioData, conversationHistory, crushGender, text } = await request.json()

    console.log(`🚀 OPTIMIZED Gemini API - Action: ${action}`)

    switch (action) {
      case "speech_to_text":
        return await handleOptimizedSpeechToText(audioData, GEMINI_API_KEY)

      case "generate_response":
        return await generateOptimizedResponse(text, conversationHistory, crushGender, GEMINI_API_KEY)

      case "test":
        return NextResponse.json({ success: true, message: "Optimized Gemini API ready" })

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("❌ Optimized Gemini API error:", error)
    return NextResponse.json({ error: "API processing failed" }, { status: 500 })
  }
}

async function handleOptimizedSpeechToText(audioData: string, apiKey: string) {
  try {
    console.log("🎤 OPTIMIZED STT: Fast Gemini transcription...")

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: "audio/webm",
                    data: audioData,
                  },
                },
                {
                  text: "Transcribe this audio to text. Return only the spoken words, nothing else.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 100,
          },
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Gemini STT error: ${response.status}`)
    }

    const result = await response.json()
    const transcribedText = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""

    console.log("✅ OPTIMIZED STT complete:", transcribedText)

    return NextResponse.json({
      transcription: transcribedText,
      confidence: 0.95,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error("❌ Optimized STT error:", error)
    return NextResponse.json({
      transcription: "",
      confidence: 0,
      error: error.message,
    })
  }
}

async function generateOptimizedResponse(
  userText: string,
  conversationHistory: any[],
  crushGender: string,
  apiKey: string,
) {
  try {
    console.log("🧠 OPTIMIZED Response Generation:", userText)

    // Simplified context for faster processing
    const recentContext = conversationHistory
      .slice(-3) // Only last 3 exchanges for speed
      .map((entry) => `${entry.speaker === "user" ? "User" : "AI"}: "${entry.text}"`)
      .join("\n")

    const optimizedPrompt = `You are helping someone talk to their ${crushGender} crush.

User said: "${userText}"

Recent context:
${recentContext}

Generate a charming, natural response (1-2 sentences max) that the user should say next. Be authentic and engaging.

Response:`

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: optimizedPrompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 100, // Reduced for faster response
            topP: 0.8,
          },
        }),
      },
    )

    if (!response.ok) {
      throw new Error(`Gemini Response error: ${response.status}`)
    }

    const result = await response.json()
    const suggestion = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""

    console.log("✅ OPTIMIZED Response complete:", suggestion)

    return NextResponse.json({
      suggestion,
      confidence: 0.92,
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error("❌ Optimized response error:", error)

    // Fast fallback
    const fallbackSuggestions =
      crushGender === "boy"
        ? [
            "That's really cool! Tell me more about that.",
            "I love how you think about these things.",
            "You always have such interesting perspectives.",
          ]
        : [
            "That's so interesting! You have such a beautiful way of seeing things.",
            "I love your energy! You always make everything sound exciting.",
            "You're so genuine - it's really refreshing to talk to you.",
          ]

    return NextResponse.json({
      suggestion: fallbackSuggestions[Math.floor(Math.random() * fallbackSuggestions.length)],
      confidence: 0.75,
      timestamp: Date.now(),
    })
  }
}
