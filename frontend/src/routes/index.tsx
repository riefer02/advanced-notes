import { createFileRoute, Link } from '@tanstack/react-router'
import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react'

export const Route = createFileRoute('/')({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Advanced Notes
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
                    Sign In
                  </button>
                </SignInButton>
                <Link to="/sign-up">
                  <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                    Get Started
                  </button>
                </Link>
              </SignedOut>
              <SignedIn>
                <Link 
                  to="/dashboard"
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Dashboard
                </Link>
                <UserButton afterSignOutUrl="/" />
              </SignedIn>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center space-y-8">
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight">
            Transform Audio into
            <span className="block bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Organized Knowledge
            </span>
          </h2>
          
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Advanced AI-powered transcription with automatic categorization. 
            Turn your voice notes into a searchable, organized knowledge base.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
            <SignedOut>
              <Link to="/sign-up">
                <button className="px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105">
                  Start Free Trial
                </button>
              </Link>
              <SignInButton mode="modal">
                <button className="px-8 py-4 text-lg font-semibold text-gray-700 bg-white border-2 border-gray-300 hover:border-gray-400 rounded-lg transition-all">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <Link to="/dashboard">
                <button className="px-8 py-4 text-lg font-semibold text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105">
                  Go to Dashboard
                </button>
              </Link>
            </SignedIn>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-24">
          <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">🎤</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              AI Transcription
            </h3>
            <p className="text-gray-600">
              State-of-the-art speech recognition powered by OpenAI Whisper for accurate transcriptions
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">🏷️</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Smart Categorization
            </h3>
            <p className="text-gray-600">
              Automatic organization with AI-powered categories and tags for easy retrieval
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Semantic Search
            </h3>
            <p className="text-gray-600">
              Find your notes instantly with powerful search across all your transcriptions
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

