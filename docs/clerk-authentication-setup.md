# Clerk Authentication Setup

## Overview

The application now uses **Clerk** for authentication, providing a secure, modern authentication system with minimal setup. This includes:

- 🔐 **Frontend Authentication** - React components and hooks
- 🛡️ **Backend JWT Verification** - Flask middleware for protecting API endpoints
- 🚀 **Effortless Integration** - Out-of-the-box components and flows

## Frontend Setup

### 1. Environment Configuration

Create a `.env` file in the `frontend/` directory:

```bash
# Clerk Configuration
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here

# Backend API
VITE_API_URL=http://localhost:5001
```

**Where to find your keys:**
1. Go to https://dashboard.clerk.com/
2. Select your application
3. Navigate to **API Keys**
4. Copy your **Publishable Key**

### 2. Package Installation

Already installed:
```bash
npm install @clerk/clerk-react
```

### 3. Routes Structure

```
frontend/src/routes/
├── __root.tsx          # Root layout
├── index.tsx           # Landing page (public)
├── sign-in.$.tsx       # Sign-in page (Clerk component)
├── sign-up.$.tsx       # Sign-up page (Clerk component)
└── dashboard.tsx       # Protected dashboard
```

### 4. Key Features

#### Landing Page (`/`)
- Beautiful splash page with hero section
- Sign In / Sign Up buttons
- Conditional rendering based on auth state
- Smooth transition to dashboard for logged-in users

#### Authentication Pages
- `/sign-in` - Pre-built Clerk sign-in component
- `/sign-up` - Pre-built Clerk sign-up component
- Support for email/password, magic links, and social auth
- Mobile-responsive design
- Automatic redirects after authentication

#### Protected Dashboard (`/dashboard`)
- Only accessible to authenticated users
- Automatic redirect to sign-in if not authenticated
- Full transcription and notes functionality
- User button with account management

### 5. Clerk Components Used

```typescript
import { 
  ClerkProvider,    // Wrap entire app
  SignedIn,         // Conditional render for authenticated users
  SignedOut,        // Conditional render for unauthenticated users
  SignInButton,     // Trigger sign-in modal/redirect
  SignUp,           // Full sign-up page component
  SignIn,           // Full sign-in page component
  UserButton,       // User avatar with dropdown menu
  useAuth,          // Hook for auth state and getToken()
} from '@clerk/clerk-react'
```

## Backend Setup

### 1. Environment Configuration

Add to `backend/.env`:

```bash
# Clerk Configuration
CLERK_DOMAIN=your-clerk-domain.clerk.accounts.dev
CLERK_SECRET_KEY=sk_test_your_secret_key_here
```

**Where to find these:**
1. **CLERK_DOMAIN**: Go to Clerk Dashboard → **API Keys** → Look for "Issuer" in JWT Template section
   - Format: `your-app-name.clerk.accounts.dev`
   - Or custom domain if you've set one up

2. **CLERK_SECRET_KEY**: Same page, copy **Secret Key**
   - ⚠️ Keep this secret! Never commit to git

### 2. Package Installation

Already installed:
```bash
pip install 'python-jose[cryptography]' requests
```

These are now in the global Python environment. To add to your project's dependencies, update `pyproject.toml`:

```toml
[project]
dependencies = [
    # ... existing deps
    "python-jose[cryptography]>=3.3.0",
    "requests>=2.31.0",
]
```

Then regenerate requirements.txt:
```bash
cd backend
uv pip compile pyproject.toml -o requirements.txt
```

### 3. Authentication Middleware

Created in `backend/app/auth.py`:

```python
from app.auth import require_auth, optional_auth

# Protect a route (returns 401 if not authenticated)
@app.route('/api/protected')
@require_auth
def protected_route():
    from flask import g
    user_id = g.user_id  # Clerk user ID
    return {'message': f'Hello user {user_id}'}

# Optional auth (works with or without token)
@app.route('/api/public')
@optional_auth  
def public_route():
    from flask import g
    if hasattr(g, 'user_id'):
        return {'message': f'Hello {g.user_id}'}
    return {'message': 'Hello guest'}
```

### 4. How JWT Verification Works

1. **Frontend**: When user signs in, Clerk provides a JWT token
2. **API Calls**: Frontend sends token in `Authorization: Bearer <token>` header
3. **Backend**: Flask middleware intercepts request
4. **Verification**:
   - Fetches Clerk's public keys (JWKS) from `https://CLERK_DOMAIN/.well-known/jwks.json`
   - Verifies token signature using public key cryptography
   - Validates issuer, expiration, and other claims
   - Extracts user ID from token's `sub` claim
5. **Request Processing**: If valid, user info is stored in `flask.g.user`

### 5. Protecting Routes

#### Example: Protect Transcription Endpoint

```python
# backend/app/routes.py
from .auth import require_auth

@bp.post("/transcribe")
@require_auth
def transcribe():
    from flask import g
    user_id = g.user_id  # User who owns this transcription
    
    # ... existing transcription logic ...
    # You can now associate notes with user_id
```

#### Example: User-Specific Notes

```python
@bp.get("/notes")
@require_auth
def get_notes():
    from flask import g
    user_id = g.user_id
    
    # Filter notes by user_id
    notes = storage.get_user_notes(user_id)
    return jsonify(notes)
```

### 6. Database Schema Updates (Future)

To make the app multi-user, you'll want to add `user_id` to your notes table:

```sql
ALTER TABLE notes ADD COLUMN user_id VARCHAR(255);
CREATE INDEX idx_notes_user_id ON notes(user_id);
```

Then update queries to filter by user_id:
```python
def get_user_notes(self, user_id: str):
    cursor = self.conn.cursor()
    cursor.execute(
        "SELECT * FROM notes WHERE user_id = %s ORDER BY created_at DESC",
        (user_id,)
    )
    # ...
```

## Testing Authentication

### 1. Create a Clerk Account

1. Go to https://clerk.com/ and sign up
2. Create a new application
3. Choose authentication methods:
   - ✅ Email/Password (recommended)
   - ✅ Google (optional)
   - ✅ GitHub (optional)

### 2. Configure Development URLs

In Clerk Dashboard → **Paths**:
- Sign-in URL: `/sign-in`
- Sign-up URL: `/sign-up`
- After sign-in URL: `/dashboard`
- After sign-up URL: `/dashboard`

### 3. Test the Flow

1. **Start Backend**:
   ```bash
   cd backend
   python -m flask run --port=5001
   ```

2. **Start Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```

3. **Test Routes**:
   - Visit http://localhost:5174/ → See landing page
   - Click "Get Started" → Redirects to sign-up
   - Complete sign-up → Redirects to dashboard
   - Sign out → Returns to landing page

4. **Test API Authentication**:
   ```bash
   # Without token (should fail with 401)
   curl http://localhost:5001/api/notes
   
   # With token (get from browser DevTools → Network → Headers)
   curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
        http://localhost:5001/api/notes
   ```

## Current Implementation Status

### ✅ Completed

- [x] Frontend Clerk integration with ClerkProvider
- [x] Landing page with sign-in/sign-up flows
- [x] Protected dashboard route
- [x] Authentication pages (sign-in, sign-up)
- [x] API client updated to send auth tokens
- [x] Flask JWT verification middleware created
- [x] User button with account management

### 🔄 Next Steps (Optional)

- [ ] Add `@require_auth` decorator to API routes
- [ ] Add `user_id` column to database
- [ ] Update storage service to filter by user
- [ ] Add user profile page
- [ ] Add organization support (multi-tenancy)
- [ ] Set up Clerk webhooks for user events
- [ ] Add role-based access control (RBAC)

## Customization Options

### Custom Sign-In/Sign-Up Pages

If you want custom branding, you can build your own forms:

```typescript
import { useSignIn, useSignUp } from '@clerk/clerk-react'

function CustomSignIn() {
  const { signIn, setActive } = useSignIn()
  
  const handleSubmit = async (email, password) => {
    const result = await signIn.create({
      identifier: email,
      password,
    })
    
    if (result.status === 'complete') {
      await setActive({ session: result.createdSessionId })
    }
  }
  
  // Your custom form UI
}
```

### Authentication Methods

Enable/disable in Clerk Dashboard → **User & Authentication** → **Email, Phone, Username**:

- Email + Password
- Email only (passwordless)
- Phone (SMS)
- Social OAuth (Google, GitHub, etc.)
- Web3 (wallet-based)
- SAML SSO (enterprise)

### Session Configuration

In Clerk Dashboard → **Sessions**:
- Session lifetime (default: 7 days)
- Idle timeout
- Multi-session handling
- Device tracking

## Security Best Practices

1. **Never commit secrets**:
   - Keep `.env` in `.gitignore`
   - Use different keys for dev/prod
   
2. **Use HTTPS in production**:
   - Clerk requires HTTPS for production domains
   - Get free SSL with Railway, Vercel, or Cloudflare

3. **Rotate keys periodically**:
   - Clerk Dashboard → API Keys → Rotate

4. **Monitor activity**:
   - Clerk Dashboard → Users → Activity logs
   - Set up webhooks for suspicious activity

5. **Rate limiting**:
   - Clerk provides built-in rate limiting
   - Add additional rate limiting on your backend

## Troubleshooting

### "Missing Clerk Publishable Key" Error

**Problem**: Frontend shows error on startup

**Solution**: Create `frontend/.env` with `VITE_CLERK_PUBLISHABLE_KEY`

### 401 Unauthorized on API Calls

**Possible causes**:
1. Token not being sent → Check Network tab in DevTools
2. Invalid CLERK_DOMAIN → Verify in backend/.env
3. Token expired → Sign out and sign back in
4. JWKS fetch failing → Check backend logs

**Debug**:
```python
# Add to backend/app/auth.py in verify_clerk_token()
print(f"Token: {token[:20]}...")
print(f"JWKS URL: https://{CLERK_DOMAIN}/.well-known/jwks.json")
print(f"Payload: {payload}")
```

### SignIn Component Not Showing

**Problem**: Blank page on `/sign-in`

**Solution**: Check Clerk Dashboard → **Paths** are configured correctly

### Development vs Production

**Development**:
- Use `http://localhost` URLs
- Use test mode keys (`pk_test_`, `sk_test_`)

**Production**:
- Use your actual domain
- Switch to live mode keys (`pk_live_`, `sk_live_`)
- Update environment variables

## Resources

- [Clerk Documentation](https://clerk.com/docs)
- [React Quickstart](https://clerk.com/docs/quickstarts/react)
- [JWT Verification](https://clerk.com/docs/backend-requests/handling/manual-jwt)
- [Python Backend Guide](https://clerk.com/docs/backend-requests/making/python)

## Support

For issues or questions:
1. Check [Clerk's Discord](https://clerk.com/discord)
2. Review [Clerk Documentation](https://clerk.com/docs)
3. Check browser console and backend logs
4. Review Network tab for API requests

