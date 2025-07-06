"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Heart, Sparkles, Mic, ArrowRight, Volume2 } from "lucide-react"

type CrushGender = "boy" | "girl" | null

export default function SetupScreen() {
  const [selectedGender, setSelectedGender] = useState<CrushGender>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [audioTestPlayed, setAudioTestPlayed] = useState(false)

  const testAudio = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const testMessage = "Audio test successful! Your earphones are working correctly."
      const utterance = new SpeechSynthesisUtterance(testMessage)
      utterance.onend = () => setAudioTestPlayed(true)
      speechSynthesis.speak(utterance)
    }
  }

  const handleStartConversation = async () => {
    if (!selectedGender) return

    setIsStarting(true)

    // Store gender selection in sessionStorage for the conversation screen
    if (typeof window !== "undefined") {
      sessionStorage.setItem("crushGender", selectedGender)
    }

    // Navigate to conversation screen
    setTimeout(() => {
      window.location.href = "/conversation"
    }, 500)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Sparkles className="h-10 w-10 text-yellow-400" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              AI Rizz Assistant
            </h1>
            <Heart className="h-10 w-10 text-pink-400" />
          </div>
          <p className="text-xl text-gray-300 max-w-xl mx-auto">
            Get real-time AI conversation suggestions powered by Gemini 2.0 Flash! Just speak and get instant coaching.
          </p>
        </div>

        {/* Audio Test */}
        <Card className="bg-white/10 backdrop-blur-lg border-white/20">
          <CardHeader className="text-center">
            <CardTitle className="text-xl text-white flex items-center justify-center gap-2">
              <Volume2 className="h-5 w-5" />
              Test Audio First
            </CardTitle>
            <CardDescription className="text-gray-300">Test your earphones/headphones before starting</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={testAudio} className="bg-blue-600 hover:bg-blue-700 text-white mb-4" size="lg">
              <Volume2 className="mr-2 h-4 w-4" />
              Test Audio Output
            </Button>
            {audioTestPlayed && (
              <Badge className="bg-green-500/20 text-green-300 border-green-400 block">✓ Audio Test Complete</Badge>
            )}
          </CardContent>
        </Card>

        {/* Gender Selection */}
        <Card className="bg-white/10 backdrop-blur-lg border-white/20">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl text-white flex items-center justify-center gap-2">
              <User className="h-6 w-6" />
              Who's your Crush?
            </CardTitle>
            <CardDescription className="text-gray-300">
              This helps Gemini AI tailor the conversation suggestions for better results
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant={selectedGender === "boy" ? "default" : "outline"}
                size="lg"
                className={`h-20 text-lg font-semibold transition-all ${
                  selectedGender === "boy"
                    ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-400"
                    : "bg-white/10 hover:bg-white/20 text-white border-white/30"
                }`}
                onClick={() => setSelectedGender("boy")}
              >
                <div className="flex flex-col items-center gap-2">
                  <User className="h-8 w-8" />
                  <span>Boy</span>
                </div>
              </Button>

              <Button
                variant={selectedGender === "girl" ? "default" : "outline"}
                size="lg"
                className={`h-20 text-lg font-semibold transition-all ${
                  selectedGender === "girl"
                    ? "bg-pink-500 hover:bg-pink-600 text-white border-pink-400"
                    : "bg-white/10 hover:bg-white/20 text-white border-white/30"
                }`}
                onClick={() => setSelectedGender("girl")}
              >
                <div className="flex flex-col items-center gap-2">
                  <User className="h-8 w-8" />
                  <span>Girl</span>
                </div>
              </Button>
            </div>

            {selectedGender && (
              <div className="text-center space-y-4">
                <Badge className="bg-green-500/20 text-green-300 border-green-400">
                  ✓ Gender Selected: {selectedGender === "boy" ? "Boy" : "Girl"}
                </Badge>

                <Button
                  onClick={handleStartConversation}
                  disabled={isStarting}
                  size="lg"
                  className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                >
                  {isStarting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
                      Starting Gemini AI...
                    </>
                  ) : (
                    <>
                      <Mic className="mr-2 h-5 w-5" />
                      Start AI Rizz Assistant
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* How It Works */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="bg-white/5 backdrop-blur border-white/10">
            <CardContent className="pt-6 text-center">
              <Mic className="h-8 w-8 text-blue-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white mb-1">1. Speak Naturally</h3>
              <p className="text-sm text-gray-400">Gemini AI detects your speech automatically</p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 backdrop-blur border-white/10">
            <CardContent className="pt-6 text-center">
              <Sparkles className="h-8 w-8 text-purple-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white mb-1">2. AI Analyzes</h3>
              <p className="text-sm text-gray-400">Advanced AI generates perfect conversation responses</p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 backdrop-blur border-white/10">
            <CardContent className="pt-6 text-center">
              <Heart className="h-8 w-8 text-pink-400 mx-auto mb-2" />
              <h3 className="font-semibold text-white mb-1">3. Get Suggestions</h3>
              <p className="text-sm text-gray-400">Hear perfect responses through your earphones</p>
            </CardContent>
          </Card>
        </div>

        {/* Disclaimer */}
        <Card className="bg-yellow-500/10 border-yellow-400/30">
          <CardContent className="pt-6">
            <p className="text-sm text-yellow-200 text-center">
              <strong>Use Responsibly:</strong> This tool helps build conversation confidence. Always be genuine and
              authentic. Real connections are built on honesty and mutual respect.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
