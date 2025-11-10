# Authentication Flow: How It All Connects

## The Big Picture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Browser   │         │    Clerk    │         │ Your Flask  │
│  (React)    │         │   Service   │         │   Backend   │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                        │
       │ 1. User signs up      │                        │
       │─────────────────────>│                        │
       │                       │                        │
       │ 2. Clerk creates user │                        │
       │    and returns JWT    │                        │
       │<─────────────────────│                        │
       │                       │                        │
       │ 3. Store JWT in       │                        │
       │    browser memory     │                        │
       │                       │                        │
       │ 4. API call with      │                        │
       │    "Authorization:    │                        │
       │     Bearer <JWT>"     │                        │
       │────────────────────────────────────────────>│
       │                       │                        │
       │                       │ 5. Backend asks Clerk: │
       │                       │    "Is this JWT valid?"│
       │                       │<───────────────────────│
       │                       │                        │
       │                       │ 6. Clerk sends public  │
       │                       │    keys (JWKS)         │
       │                       │────────────────────────>│
       │                       │                        │
       │                       │    7. Backend verifies │
       │                       │       JWT signature    │
       │                       │       & extracts       │
       │                       │       user_id          │
       │                       │                        │
       │ 8. Return user's data │                        │
       │<────────────────────────────────────────────│
       │                       │                        │
```

## Step-by-Step Explanation

### 1️⃣ User Signs Up/Signs In (Frontend → Clerk)

**What happens:**
```typescript
// User clicks "Sign Up" button in your React app
// Clerk's <SignUp /> component handles everything:
// - Shows form
// - Validates email/password
// - Sends credentials to Clerk's servers
// - Clerk creates the user account
```

**Result:** User account is created in Clerk's database (not yours yet!)

---

### 2️⃣ Clerk Issues a JWT Token

**What happens:**
- Clerk generates a **JWT (JSON Web Token)** for this user
- The JWT contains:
  ```json
  {
    "sub": "user_2abc123xyz",  // User ID (THIS IS KEY!)
    "email": "user@example.com",
    "iss": "https://clerk.your-domain.clerk.accounts.dev",
    "exp": 1234567890,  // Expiration time
    "iat": 1234567800   // Issued at time
  }
  ```
- This JWT is **digitally signed** by Clerk using their private key
- The token is stored in your browser's memory (not localStorage for security)

**Result:** User has a token that proves they're authenticated

---

### 3️⃣ Frontend Makes API Call with Token

**What happens:**
```typescript
// In your React app (frontend/src/lib/api.ts)
const { getToken } = useAuth()  // Clerk hook

async function fetchNotes() {
  const token = await getToken()  // Get JWT from Clerk
  
  const response = await fetch('http://localhost:5001/api/notes', {
    headers: {
      'Authorization': `Bearer ${token}`  // Send token here!
    }
  })
  
  return response.json()
}
```

**Result:** Your Flask backend receives the request with the JWT in the header

---

### 4️⃣ Backend Verifies the JWT (Your Flask App)

**This is where the magic happens!**

```python
# backend/app/auth.py - Your custom middleware

@require_auth
def get_notes():
    # When this decorator runs:
    
    # 1. Extract token from "Authorization: Bearer <token>" header
    token = request.headers.get('Authorization').split('Bearer ')[1]
    
    # 2. Fetch Clerk's public keys (JWKS) from:
    #    https://clerk.your-domain.clerk.accounts.dev/.well-known/jwks.json
    jwks = fetch_clerk_jwks()
    
    # 3. Verify the JWT signature using Clerk's public key
    #    - If signature is valid: JWT was signed by Clerk ✅
    #    - If signature is invalid: JWT is fake/tampered ❌
    payload = verify_jwt_signature(token, jwks)
    
    # 4. Check expiration and other claims
    if payload['exp'] < now():
        return 401  # Token expired
    
    # 5. Extract user_id from the 'sub' claim
    user_id = payload['sub']  # e.g., "user_2abc123xyz"
    
    # 6. Store in Flask's 'g' object for this request
    g.user_id = user_id
    
    # 7. Continue to your route handler
```

**Result:** Backend knows WHO is making the request and can trust it

---

### 5️⃣ Use user_id to Filter Data (This is where YOU come in!)

**Now you can filter data by user:**

```python
@bp.get("/notes")
@require_auth  # This ensures g.user_id is set
def get_notes():
    from flask import g
    
    # NOW you have the authenticated user's ID!
    user_id = g.user_id  # e.g., "user_2abc123xyz"
    
    # Query YOUR database for this user's notes only
    notes = storage.get_notes_for_user(user_id)
    
    return jsonify(notes)
```

---

## 🔑 Why This is Secure

### Public Key Cryptography (The Core Security)

1. **Clerk has a private key** (secret, only Clerk knows it)
2. **Clerk has a public key** (shared with everyone via JWKS endpoint)
3. **Clerk signs JWTs with their private key**
4. **Your backend verifies JWTs with Clerk's public key**

**The magic:**
- ✅ If a JWT verifies with the public key → it MUST have been signed by Clerk
- ❌ A hacker can't fake a JWT without Clerk's private key
- ✅ You don't need to call Clerk's API for every request (fast!)
- ✅ The JWT contains the user_id, so you know WHO the user is

### What Could Go Wrong? (And How We Prevent It)

**❌ Scenario 1: Hacker steals a JWT**
- **Risk:** They can impersonate the user until the JWT expires
- **Mitigation:** JWTs expire after ~1 hour (configurable in Clerk)
- **Mitigation:** Use HTTPS so tokens can't be intercepted

**❌ Scenario 2: Hacker tries to modify the JWT**
- **Risk:** Change user_id to access someone else's data
- **Protection:** JWT signature verification would FAIL
- **Result:** Backend rejects the request (401 Unauthorized)

**❌ Scenario 3: Hacker creates a fake JWT**
- **Risk:** Pretend to be any user
- **Protection:** Can't sign it without Clerk's private key
- **Result:** Signature verification FAILS

---

## 🎯 How You'll Use This for User-Specific Data

### Current State: No User Filtering

Right now, your database looks like this:

```sql
CREATE TABLE notes (
    id UUID PRIMARY KEY,
    title TEXT,
    content TEXT,
    folder_path TEXT,
    -- ... other fields ...
);
```

**Problem:** ALL users see ALL notes (no privacy!)

### Step 1: Add user_id Column to Database

```sql
ALTER TABLE notes ADD COLUMN user_id VARCHAR(255);
CREATE INDEX idx_notes_user_id ON notes(user_id);
```

### Step 2: Update Storage Service

```python
# backend/app/services/storage.py

class NoteStorage:
    def create_note(self, note_data: dict, user_id: str):
        """Save a note for a specific user"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO notes (
                id, user_id, title, content, folder_path, ...
            ) VALUES (%s, %s, %s, %s, %s, ...)
        """, (
            note_id, user_id, title, content, folder_path, ...
        ))
        self.conn.commit()
    
    def get_notes_for_user(self, user_id: str):
        """Get all notes belonging to a specific user"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM notes 
            WHERE user_id = %s 
            ORDER BY created_at DESC
        """, (user_id,))
        
        return cursor.fetchall()
```

### Step 3: Update API Routes

```python
# backend/app/routes.py
from .auth import require_auth
from flask import g

@bp.post("/transcribe")
@require_auth  # Now this route requires authentication!
def transcribe():
    # Get the authenticated user's ID
    user_id = g.user_id  # Set by @require_auth decorator
    
    # ... do transcription ...
    
    # Save the note with user_id
    note_id = storage.create_note({
        'title': title,
        'content': transcription_text,
        'folder_path': folder_path,
        # ...
    }, user_id=user_id)  # Associate with this user!
    
    return jsonify({...})


@bp.get("/notes")
@require_auth
def get_notes():
    user_id = g.user_id
    
    # Only return THIS user's notes
    notes = storage.get_notes_for_user(user_id)
    
    return jsonify({'notes': notes})


@bp.delete("/notes/<note_id>")
@require_auth
def delete_note(note_id):
    user_id = g.user_id
    
    # Make sure the note belongs to this user before deleting!
    note = storage.get_note(note_id)
    if note['user_id'] != user_id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    storage.delete_note(note_id)
    return jsonify({'success': True})
```

---

## 📊 Complete Data Flow Example

Let's trace a complete request:

### Example: User Creates a Note

**1. User records audio and clicks "Transcribe"**

**2. Frontend sends request:**
```javascript
const token = await getToken()  // "eyJhbGciOiJSUzI1NiIs..."

fetch('http://localhost:5001/api/transcribe', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData  // Audio file
})
```

**3. Backend receives request:**
```python
@bp.post("/transcribe")
@require_auth  # <-- This runs first!
def transcribe():
    # @require_auth already did:
    # - Verified JWT signature ✓
    # - Checked expiration ✓
    # - Extracted user_id ✓
    # - Stored in g.user_id ✓
    
    user_id = g.user_id  # "user_2abc123xyz"
    
    # Process audio...
    text = transcribe_audio(audio_file)
    
    # Save to database WITH user_id
    note = storage.create_note({
        'title': generate_title(text),
        'content': text,
        'folder_path': '/personal',
    }, user_id=user_id)  # <-- User ownership!
    
    return jsonify(note)
```

**4. Database row created:**
```
id: note_123
user_id: user_2abc123xyz  <-- Key field!
title: "Meeting Notes"
content: "Discussed project timeline..."
```

**5. Later, when user fetches notes:**
```python
@bp.get("/notes")
@require_auth
def get_notes():
    user_id = g.user_id  # "user_2abc123xyz"
    
    # SQL: SELECT * FROM notes WHERE user_id = 'user_2abc123xyz'
    # Only returns THIS user's notes!
    notes = storage.get_notes_for_user(user_id)
    
    return jsonify(notes)
```

**6. Different user can't access those notes:**
```python
# User "user_999xyz" tries to access notes
@bp.get("/notes")
@require_auth
def get_notes():
    user_id = g.user_id  # "user_999xyz" (different user!)
    
    # SQL: SELECT * FROM notes WHERE user_id = 'user_999xyz'
    # Returns EMPTY or only their own notes!
    notes = storage.get_notes_for_user(user_id)
    
    return jsonify(notes)  # Won't include user_2abc123xyz's notes
```

---

## 🚀 Your Next Steps

### Immediate (Already Done ✅):
- [x] Frontend sends JWT tokens
- [x] Backend can verify JWT tokens
- [x] Backend can extract user_id

### Soon (When you're ready):
1. **Add user_id to database:**
   ```sql
   ALTER TABLE notes ADD COLUMN user_id VARCHAR(255);
   ```

2. **Update your storage service:**
   - Add `user_id` parameter to `create_note()`
   - Add `get_notes_for_user(user_id)` method
   - Filter all queries by user_id

3. **Protect all API routes:**
   ```python
   @bp.post("/transcribe")
   @require_auth  # Add this decorator
   def transcribe():
       user_id = g.user_id  # Use this!
   ```

4. **Test with multiple accounts:**
   - Sign up as user A → create notes
   - Sign up as user B → should NOT see user A's notes
   - Verify isolation works!

---

## 🔍 Debugging Tips

### See the JWT payload:
```python
# Add to your route temporarily:
from flask import g
print(f"User ID: {g.user_id}")
print(f"Full user info: {g.user}")
```

### Test without frontend:
```bash
# Get a token from browser DevTools → Network → Headers
TOKEN="eyJhbGciOiJSUzI1NiIs..."

# Test API call
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:5001/api/notes
```

### Check if JWT is valid:
Go to https://jwt.io/ and paste your token to see the decoded payload!

---

## Summary

**The Three Keys:**
1. **CLERK_PUBLISHABLE_KEY** (Frontend) - Identifies your app to Clerk
2. **CLERK_SECRET_KEY** (Backend) - For direct Clerk API calls (optional)
3. **CLERK_DOMAIN** (Backend) - Where to fetch public keys for JWT verification

**The Flow:**
```
User → Clerk (authenticates) → JWT → Frontend → Backend (verifies) → g.user_id → Filter data
```

**The Security:**
- JWTs are signed with Clerk's private key
- Your backend verifies with Clerk's public key
- Impossible to fake without Clerk's private key
- Each JWT contains the user's unique ID

**The Result:**
- You know WHO is making each request
- You can filter database queries by user_id
- Each user only sees their own data
- No need to store passwords or manage authentication yourself!

