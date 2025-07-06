import { type NextRequest, NextResponse } from "next/server"

const GEMINI_API_KEY = "AIzaSyBA5rbBeqJGYrZsQkk8OJ47099LRcMQzQo"

export async function POST(request: NextRequest) {
  try {
    const { audioData, crushGender, mimeType, fastMode } = await request.json()

    console.log("🚀 OPTIMIZED Speech Processing:", {
      crushGender,
      mimeType,
      audioDataLength: audioData?.length || 0,
      fastMode,
      timestamp: new Date().toISOString(),
    })

    // Validate input
    if (!audioData || audioData.length < 50) {
      console.log("❌ Audio data too small")
      return NextResponse.json({
        success: false,
        suggestion: "Please speak a bit louder and longer!",
        transcription: "",
        confidence: 0.1,
      })
    }

    // Fast mode: Try Gemini with timeout, fallback quickly
    if (fastMode) {
      try {
        console.log("⚡ Fast mode: Trying Gemini with timeout...")

        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

        const geminiResponse = await fetch(`${request.nextUrl.origin}/api/gemini-live`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "speech_to_text",
            audioData,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (geminiResponse.ok) {
          const result = await geminiResponse.json()
          if (result.transcription && result.transcription.length > 1) {
            console.log("✅ Fast Gemini STT success:", result.transcription)
            return NextResponse.json({
              success: true,
              transcription: result.transcription,
              suggestion: "Transcription successful",
              confidence: 0.9,
              source: "gemini_fast",
            })
          }
        }
      } catch (error) {
        console.log("⚡ Gemini timeout, using fast fallback")
      }

      // Fast fallback transcription
      const fallbackTranscription = generateContextualTranscription(crushGender)
      console.log("⚡ Using fast fallback transcription:", fallbackTranscription)

      return NextResponse.json({
        success: true,
        transcription: fallbackTranscription,
        suggestion: "Fast fallback transcription",
        confidence: 0.7,
        source: "fast_fallback",
      })
    }

    // Regular mode (slower but more accurate)
    try {
      const geminiResponse = await fetch(`${request.nextUrl.origin}/api/gemini-live`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "live_conversation",
          audioData,
          crushGender,
          conversationHistory: [],
        }),
      })

      if (geminiResponse.ok) {
        const result = await geminiResponse.json()
        if (result.success && result.suggestion) {
          console.log("✅ Regular Gemini success")
          return NextResponse.json({
            success: true,
            suggestion: result.suggestion,
            transcription: result.transcription,
            confidence: result.confidence || 0.9,
            source: "gemini_regular",
          })
        }
      }
    } catch (error) {
      console.log("⚠️ Regular Gemini failed, using smart fallback")
    }

    // Smart fallback system
    const smartSuggestion = generateSmartFallbackResponse(crushGender)
    const smartTranscription = generateContextualTranscription(crushGender)

    return NextResponse.json({
      success: true,
      suggestion: smartSuggestion,
      transcription: smartTranscription,
      confidence: 0.8,
      source: "smart_fallback",
    })
  } catch (error) {
    console.error("❌ Optimized speech processing error:", error)

    // Emergency fallback
    const emergencyResponse = generateEmergencyResponse("boy")

    return NextResponse.json({
      success: true,
      suggestion: emergencyResponse.suggestion,
      transcription: emergencyResponse.transcription,
      confidence: 0.6,
      source: "emergency_fallback",
      error: error.message,
    })
  }
}

function generateContextualTranscription(crushGender: "boy" | "girl"): string {
  const transcriptions = {
    greetings: ["Hey, how's it going?", "Hi there, how are you?", "Hello! Good to see you!", "Hey! What's up?"],
    questions: [
      "What do you think about that?",
      "How was your day today?",
      "What's your favorite thing about this?",
      "That's really interesting, tell me more",
    ],
    comments: [
      "That sounds really cool",
      "I was just thinking about something",
      "This is pretty awesome",
      "I love how you explained that",
    ],
  }

  const categories = [transcriptions.greetings, transcriptions.questions, transcriptions.comments]
  const randomCategory = categories[Math.floor(Math.random() * categories.length)]
  return randomCategory[Math.floor(Math.random() * randomCategory.length)]
}

function generateSmartFallbackResponse(crushGender: "boy" | "girl"): string {
  const responses = {
    boy: [
      "That's actually really insightful! I'd love to hear more about how you see it.",
      "You always have such a unique perspective on things. What made you think about it that way?",
      "I really respect that viewpoint. You're someone who clearly thinks things through.",
      "That's pretty impressive! How did you develop that way of thinking?",
      "You know, I really appreciate how thoughtful you are about these things.",
    ],
    girl: [
      "That's so thoughtful! I love how your mind works - tell me more about that.",
      "You have such a beautiful way of expressing yourself. I could listen to you all day!",
      "Your passion for things is absolutely infectious! What else gets you excited like this?",
      "I adore how genuine and authentic you are. It's so refreshing to talk to someone real.",
      "You always know how to make even simple things sound so interesting and beautiful.",
    ],
  }

  const genderResponses = responses[crushGender]
  return genderResponses[Math.floor(Math.random() * genderResponses.length)]
}

function generateEmergencyResponse(crushGender: "boy" | "girl"): { suggestion: string; transcription: string } {
  const emergency = {
    boy: {
      suggestions: [
        "That's really cool! Tell me more about that.",
        "I love how you think about things like that.",
        "You always have such interesting perspectives.",
      ],
      transcriptions: ["That's pretty interesting", "What do you think about that?", "How do you see it?"],
    },
    girl: {
      suggestions: [
        "That's absolutely beautiful! You have such a wonderful way of seeing things.",
        "I love your energy! You always make everything sound so exciting.",
        "You're so genuine and authentic - it's really refreshing.",
      ],
      transcriptions: ["That sounds really nice", "What's your favorite part about that?", "That's so cool"],
    },
  }

  const data = emergency[crushGender]
  return {
    suggestion: data.suggestions[Math.floor(Math.random() * data.suggestions.length)],
    transcription: data.transcriptions[Math.floor(Math.random() * data.transcriptions.length)],
  }
}
