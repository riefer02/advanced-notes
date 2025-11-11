# Clerk Redirect Configuration for TanStack Router

## Environment Variables

### Frontend (`.env.local`)

```env
# Clerk Configuration
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx

# Redirect URLs
VITE_CLERK_SIGN_IN_URL=/sign-in
VITE_CLERK_SIGN_UP_URL=/sign-up
VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
VITE_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# API Configuration
VITE_API_URL=http://localhost:5001
```

### Backend (`.env`)

```env
# Clerk Configuration
CLERK_DOMAIN=clerk.your-app-name.xxxx.lcl.dev
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxx

# Redirect URLs (optional for backend)
CLERK_SIGN_IN_URL=/sign-in
CLERK_SIGN_UP_URL=/sign-up
CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

# Other Configuration
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...  # Auto-set by Railway
```

## Railway Environment Variables

### Frontend Service
```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxx  # Use live key for production
VITE_CLERK_SIGN_IN_URL=/sign-in
VITE_CLERK_SIGN_UP_URL=/sign-up
VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
VITE_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard
VITE_API_URL=https://your-backend.railway.app
```

### Backend Service
```bash
CLERK_DOMAIN=clerk.your-app-name.xxxx.accounts.dev  # Production domain
CLERK_SECRET_KEY=sk_live_xxxxxxxxxxxxx  # Use live key for production
CLERK_SIGN_IN_URL=/sign-in
CLERK_SIGN_UP_URL=/sign-up
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...  # Auto-set by Railway
```

## Redirect Variable Types

### Location Variables
Tell Clerk where your auth pages are:
- `CLERK_SIGN_IN_URL` - Path to sign-in page (e.g., `/sign-in`)
- `CLERK_SIGN_UP_URL` - Path to sign-up page (e.g., `/sign-up`)

### Fallback Redirect URLs (Recommended)
Default destination after auth, can be overridden by query params:
- `CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` - After sign-in (e.g., `/dashboard`)
- `CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` - After sign-up (e.g., `/dashboard`)

**Use case:** 
```
Sign in without redirect_url → Goes to /dashboard
Sign in with ?redirect_url=/notes → Goes to /notes (fallback ignored)
```

### Force Redirect URLs (Not Recommended for Most Cases)
Always goes here, ignores query params:
- `CLERK_SIGN_IN_FORCE_REDIRECT_URL` - Always after sign-in
- `CLERK_SIGN_UP_FORCE_REDIRECT_URL` - Always after sign-up

**Use case:** Onboarding flows where you want users to always go through a specific page.

## Route Configuration

### File Structure
```
frontend/src/routes/
├── __root.tsx          # Root layout with ClerkProvider
├── index.tsx           # Landing page (/)
├── dashboard.tsx       # Protected dashboard (/dashboard)
├── sign-in.$.tsx       # Sign-in catch-all (/sign-in/$)
└── sign-up.$.tsx       # Sign-up catch-all (/sign-up/$)
```

### Catch-All Routes

The `$` in route names creates catch-all routes for Clerk's nested auth flow:

```tsx
// sign-in.$.tsx
export const Route = createFileRoute('/sign-in/$')({
  component: SignInPage,
})

// sign-up.$.tsx
export const Route = createFileRoute('/sign-up/$')({
  component: SignUpPage,
})
```

**Why catch-all?** Clerk's components handle internal navigation like:
- `/sign-in` → Main sign-in
- `/sign-in/factor-one` → First auth factor
- `/sign-in/factor-two` → Second auth factor (2FA)
- `/sign-up/continue` → Multi-step sign-up flow

### Navigation with Catch-All Routes

When linking to catch-all routes, include the `$`:

```tsx
// ✅ Correct
<Link to="/sign-up/$">Sign Up</Link>

// ❌ TypeScript error
<Link to="/sign-up">Sign Up</Link>
```

## ClerkProvider Configuration

### Option 1: Environment Variables (Recommended)

Set all redirect URLs in `.env` files and use minimal provider config:

```tsx
// main.tsx
<ClerkProvider 
  publishableKey={PUBLISHABLE_KEY}
  afterSignOutUrl="/"
>
  {children}
</ClerkProvider>
```

### Option 2: Provider Props

Configure directly in the provider:

```tsx
<ClerkProvider 
  publishableKey={PUBLISHABLE_KEY}
  afterSignOutUrl="/"
  signInFallbackRedirectUrl="/dashboard"
  signUpFallbackRedirectUrl="/dashboard"
  signInUrl="/sign-in"
  signUpUrl="/sign-up"
>
  {children}
</ClerkProvider>
```

**Note:** Environment variables take precedence over provider props.

## Authentication Flow

### Complete User Journey

```
1. User visits landing page (/)
   └─ Not signed in → See landing page

2. User clicks "Get Started"
   └─ Navigate to /sign-up/$

3. User completes sign-up
   └─ Clerk redirects to CLERK_SIGN_UP_FALLBACK_REDIRECT_URL (/dashboard)

4. User browses app
   └─ Dashboard shows user content

5. User clicks logout (UserButton)
   └─ Clerk redirects to afterSignOutUrl (/)

6. User clicks "Sign In"
   └─ Navigate to /sign-in/$

7. User signs in
   └─ Clerk redirects to CLERK_SIGN_IN_FALLBACK_REDIRECT_URL (/dashboard)
```

### Protected Routes

Routes that require authentication:

```tsx
// dashboard.tsx
function DashboardPage() {
  const { isLoaded, isSignedIn } = useAuth()

  if (!isLoaded) {
    return <div>Loading...</div>
  }

  if (!isSignedIn) {
    // Clerk will handle redirect to sign-in
    return null
  }

  return <div>Dashboard content</div>
}
```

Or use `<RedirectToSignIn>`:

```tsx
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react'

function DashboardPage() {
  return (
    <>
      <SignedIn>
        <div>Dashboard content</div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}
```

## Dynamic Redirects

### Using Query Parameters

Allow users to be redirected to a specific page after auth:

```tsx
// Link to sign-in with custom redirect
<Link to="/sign-in/$" search={{ redirect_url: '/notes' }}>
  Sign in to view notes
</Link>

// Clerk will redirect to /notes after successful sign-in
// (if FALLBACK is used, not FORCE)
```

### Programmatic Navigation

```tsx
import { useNavigate } from '@tanstack/react-router'

function MyComponent() {
  const navigate = useNavigate()

  const handleProtectedAction = () => {
    // Check if user is signed in
    if (!isSignedIn) {
      navigate({ 
        to: '/sign-in/$',
        search: { redirect_url: window.location.pathname }
      })
    }
  }
}
```

## Testing Redirect Configuration

### Local Testing Checklist

1. **Sign Up Flow:**
   - [ ] Visit http://localhost:5173
   - [ ] Click "Get Started"
   - [ ] Complete sign-up
   - [ ] Verify redirect to /dashboard

2. **Sign In Flow:**
   - [ ] Sign out
   - [ ] Click "Sign In"
   - [ ] Enter credentials
   - [ ] Verify redirect to /dashboard

3. **Sign Out Flow:**
   - [ ] Click UserButton
   - [ ] Click "Sign out"
   - [ ] Verify redirect to /

4. **Protected Route:**
   - [ ] Sign out
   - [ ] Try to visit /dashboard directly
   - [ ] Verify redirect to sign-in

5. **Custom Redirect:**
   - [ ] Sign out
   - [ ] Visit /dashboard (should redirect to sign-in)
   - [ ] Sign in
   - [ ] Verify redirect back to /dashboard

## Common Issues

### Redirect Loop

**Symptom:** Browser keeps redirecting between sign-in and dashboard.

**Cause:** Conflicting redirect configuration.

**Fix:**
```env
# Make sure these don't conflict:
VITE_CLERK_SIGN_IN_URL=/sign-in  # Where sign-in page is
VITE_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard  # Where to go after sign-in
```

### TypeScript Errors on Link

**Symptom:** Type error when using `<Link to="/sign-up">`

**Cause:** Catch-all routes require the `$` in navigation.

**Fix:**
```tsx
// ✅ Correct
<Link to="/sign-up/$">Sign Up</Link>
```

### Wrong Redirect After Sign-In

**Symptom:** Goes to unexpected page after authentication.

**Cause:** Environment variables not loaded or incorrect priority.

**Fix:**
1. Check `.env.local` exists in frontend root
2. Restart dev server after changing `.env`
3. Check variable names match exactly (case-sensitive)

### Production Redirect Issues

**Symptom:** Works locally but not in production.

**Cause:** Environment variables not set in Railway.

**Fix:**
1. Go to Railway dashboard → Frontend service → Variables
2. Add all `VITE_CLERK_*` variables
3. Redeploy

## Best Practices

1. **Use FALLBACK over FORCE** - More flexible for future features
2. **Set afterSignOutUrl** - Always redirect somewhere on logout
3. **Test all flows** - Sign up, sign in, sign out, protected routes
4. **Use catch-all routes** - Enable Clerk's multi-step flows
5. **Keep URLs consistent** - Use same paths in env vars and routing
6. **Secure environment variables** - Never commit `.env.local` to git

## References

- [Clerk Redirect URLs Documentation](https://clerk.com/docs/guides/development/customize-redirect-urls)
- [TanStack Router Redirect Function](https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction)
- [Clerk TanStack Router Integration](https://clerk.com/docs/references/tanstack-start/overview)

