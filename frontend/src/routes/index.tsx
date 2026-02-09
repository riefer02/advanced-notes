import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { SignInButton, useAuth } from '@clerk/clerk-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  const { isSignedIn, isLoaded } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate({ to: '/dashboard' })
    }
  }, [isLoaded, isSignedIn, navigate])

  // Show nothing while checking auth to avoid flash
  if (!isLoaded || isSignedIn) {
    return null
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-xs sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
                Chisos
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <SignInButton mode="modal">
                <Button variant="ghost">Sign In</Button>
              </SignInButton>
              <Link to="/sign-up/$">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <div className="text-center space-y-8">
            <h2 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
              Your Life,
              <span className="block bg-linear-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Intelligently Organized
              </span>
            </h2>

            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Voice notes, meal tracking, task management, and a vinyl collection — all powered by
              AI. Speak it, snap it, or type it. Chisos handles the rest.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
              <Link to="/sign-up/$">
                <Button
                  size="lg"
                  className="text-lg px-8 py-4 h-auto bg-linear-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl"
                >
                  Get Started Free
                </Button>
              </Link>
              <SignInButton mode="modal">
                <Button variant="outline" size="lg" className="text-lg px-8 py-4 h-auto border-2">
                  Sign In
                </Button>
              </SignInButton>
            </div>
          </div>
        </section>

        {/* Core Features */}
        <section className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h3 className="text-3xl font-bold text-gray-900">Everything in one place</h3>
              <p className="text-gray-600 mt-3 max-w-xl mx-auto">
                Six tools that work together to keep your life organized — no app-switching
                required.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Voice Notes */}
              <FeatureCard
                icon={
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                    />
                  </svg>
                }
                title="Voice Notes & Transcription"
                description="Record your thoughts and get instant AI transcription powered by OpenAI Whisper. Automatic tagging, categorization, and smart organization."
                color="blue"
              />

              {/* AI Search & Summaries */}
              <FeatureCard
                icon={
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                    />
                  </svg>
                }
                title="AI Summaries & Search"
                description="Ask questions about your notes in plain English. Get AI-generated digests with key themes, action items, and cited sources."
                color="purple"
              />

              {/* Todos */}
              <FeatureCard
                icon={
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                }
                title="Smart Todos"
                description="AI automatically extracts tasks from your voice notes. Review suggestions or let them auto-accept — your to-do list builds itself."
                color="green"
              />

              {/* Meals */}
              <FeatureCard
                icon={
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z"
                    />
                  </svg>
                }
                title="Meal Tracker"
                description="Log meals by voice — just say what you ate. Browse your food diary on a calendar, track eating habits over time."
                color="orange"
              />

              {/* Vinyl */}
              <FeatureCard
                icon={
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
                    />
                  </svg>
                }
                title="Vinyl Collection"
                description="Catalog your records by snapping photos. AI extracts artist, album, label, and tracklist. Browse your collection in a visual grid."
                color="rose"
              />

              {/* Semantic Organization */}
              <FeatureCard
                icon={
                  <svg
                    className="w-7 h-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                }
                title="Semantic Search"
                description="Find anything across your notes, meals, and collection with meaning-based search. It understands what you meant, not just what you typed."
                color="teal"
              />
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h3 className="text-3xl font-bold text-gray-900">Simple to use</h3>
              <p className="text-gray-600 mt-3">Three steps to an organized life.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-12 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  1
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Capture</h4>
                <p className="text-gray-600 text-sm">
                  Record a voice note, snap a photo of your vinyl, or speak your meal. Works on
                  desktop and mobile.
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  2
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">AI Organizes</h4>
                <p className="text-gray-600 text-sm">
                  Chisos transcribes, categorizes, extracts tasks, and files everything
                  automatically. No manual sorting.
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  3
                </div>
                <h4 className="font-semibold text-gray-900 mb-2">Find Anything</h4>
                <p className="text-gray-600 text-sm">
                  Ask questions in plain English, browse summaries, or search across everything
                  you've captured.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-linear-to-r from-blue-600 to-purple-600 py-16">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h3 className="text-3xl font-bold text-white mb-4">Ready to get organized?</h3>
            <p className="text-blue-100 mb-8">Free to start. No credit card required.</p>
            <Link to="/sign-up/$">
              <Button
                size="lg"
                className="text-lg px-8 py-4 h-auto bg-white text-blue-600 hover:bg-white/90 shadow-lg hover:shadow-xl"
              >
                Get Started Free
              </Button>
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-gray-50 border-t py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-gray-500">
            Chisos
          </div>
        </footer>
      </main>
    </div>
  )
}

const COLOR_MAP: Record<string, { bg: string; text: string; icon: string }> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-900', icon: 'text-blue-600' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-900', icon: 'text-purple-600' },
  green: { bg: 'bg-green-50', text: 'text-green-900', icon: 'text-green-600' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-900', icon: 'text-orange-600' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-900', icon: 'text-rose-600' },
  teal: { bg: 'bg-teal-50', text: 'text-teal-900', icon: 'text-teal-600' },
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode
  title: string
  description: string
  color: string
}) {
  const colors = COLOR_MAP[color] ?? COLOR_MAP.blue
  return (
    <div
      className={`${colors.bg} p-6 rounded-xl border border-transparent hover:border-gray-200 hover:shadow-md transition-all`}
    >
      <div className={`${colors.icon} mb-4`}>{icon}</div>
      <h4 className={`text-lg font-semibold ${colors.text} mb-2`}>{title}</h4>
      <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  )
}
