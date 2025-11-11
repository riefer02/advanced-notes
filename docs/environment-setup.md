# Environment Setup Guide

Complete guide for setting up environment variables and API credentials.

---

## Quick Start

1. **Create `.env` file** in `backend/` directory
2. **Add your OpenAI API key** (see below for instructions)
3. **Verify setup** by running the test script

## Required Environment Variables

Create a `.env` file in the `backend/` directory with the following variables:

```bash
# Flask Configuration
FLASK_ENV=development

# OpenAI API Configuration
# Get your key from: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-your-actual-api-key-here
OPENAI_MODEL=gpt-4o-mini

# Categorization Settings
# Confidence threshold for auto-categorization (0.0-1.0)
# Below this threshold, suggestions require manual confirmation
CONFIDENCE_THRESHOLD=0.7
```

### Example `.env` File

Copy this template to `backend/.env` and fill in your actual values:

```bash
FLASK_ENV=development
OPENAI_API_KEY=sk-proj-abc123...xyz789
OPENAI_MODEL=gpt-4o-mini
CONFIDENCE_THRESHOLD=0.7
```

---

## Getting an OpenAI API Key

### Step 1: Create an Account

1. Visit [https://platform.openai.com/signup](https://platform.openai.com/signup)
2. Sign up with email or continue with Google/Microsoft
3. Verify your email address

### Step 2: Generate API Key

1. Log in to [https://platform.openai.com/](https://platform.openai.com/)
2. Navigate to [API Keys](https://platform.openai.com/api-keys)
3. Click **"Create new secret key"**
4. Give it a name (e.g., "Chisos Dev")
5. **Copy the key immediately** - you won't be able to see it again!
6. Store it securely in your `backend/.env` file

### Step 3: Add Billing Credits

OpenAI requires a minimum balance to use the API:

1. Go to [Billing](https://platform.openai.com/account/billing)
2. Click **"Add payment method"**
3. Add a credit card
4. Add at least **$5** in credits
5. Set up usage limits (recommended: $10/month max)

### Step 4: Verify Setup

Test your API key works correctly:

```bash
cd backend
python -m app.services.test_categorizer
```

If successful, you'll see categorization results for test cases.

---

## API Costs & Usage

### GPT-4o-mini Pricing (2025)

| Metric | Cost |
|--------|------|
| Input tokens | $0.15 per 1M tokens |
| Output tokens | $0.60 per 1M tokens |
| Average per categorization | $0.0001 - $0.0003 |
| 100 categorizations | ~$0.01 - $0.03 |
| 1,000 categorizations | ~$0.10 - $0.30 |

### Typical Token Usage

- **Average transcription**: 50-200 tokens
- **Categorization prompt**: ~300 tokens
- **Structured output**: ~100 tokens
- **Total per request**: ~450-600 tokens

**Example**: 
- 500 categorizations/month
- ~275,000 tokens/month
- **Cost: ~$0.15/month** (negligible!)

### Cost Optimization Tips

1. **Use GPT-4o-mini** (not GPT-4o) - 10x cheaper
2. **Cache categorization results** - avoid re-analyzing identical text
3. **Set usage limits** - prevent unexpected charges
4. **Monitor usage** via OpenAI dashboard

---

## Model Configuration

### Available Models

| Model | Speed | Cost | Best For |
|-------|-------|------|----------|
| **gpt-4o-mini** | ⚡ Fast | 💰 Cheap | Categorization (recommended) |
| gpt-4o | ⚡ Fast | 💰💰 Moderate | Complex reasoning |
| gpt-4-turbo | 🐢 Slower | 💰💰💰 Expensive | Legacy, not recommended |

### Changing Models

Edit `backend/.env`:

```bash
# Use GPT-4o-mini (default, recommended)
OPENAI_MODEL=gpt-4o-mini

# Or use GPT-4o for higher accuracy (10x more expensive)
OPENAI_MODEL=gpt-4o
```

---

## Security Best Practices

### ✅ DO

- **Store keys in `.env` file** - never in code
- **Add `.env` to `.gitignore`** - already configured
- **Use separate keys** for dev/staging/production
- **Rotate keys periodically** (every 90 days)
- **Set usage limits** on OpenAI dashboard
- **Monitor API usage** regularly

### ❌ DON'T

- **Never commit `.env` file** to git
- **Never share API keys** publicly
- **Never embed keys** in frontend code
- **Never use production keys** in development
- **Never disable usage limits** without monitoring

### Key Rotation

If a key is compromised:

1. Go to [API Keys](https://platform.openai.com/api-keys)
2. Click **"Revoke"** on the compromised key
3. Generate a new key
4. Update `backend/.env` with new key
5. Restart backend server

---

## Troubleshooting

### Error: "OpenAI API key required"

**Cause:** `.env` file missing or `OPENAI_API_KEY` not set

**Solution:**
```bash
cd backend
echo "OPENAI_API_KEY=sk-proj-your-key-here" > .env
echo "OPENAI_MODEL=gpt-4o-mini" >> .env
echo "CONFIDENCE_THRESHOLD=0.7" >> .env
```

### Error: "You exceeded your current quota"

**Cause:** No billing credits on OpenAI account

**Solution:**
1. Go to [Billing](https://platform.openai.com/account/billing)
2. Add payment method
3. Add at least $5 in credits

### Error: "Invalid API key"

**Cause:** API key is incorrect or revoked

**Solution:**
1. Verify key in `.env` matches OpenAI dashboard
2. Check for extra spaces or newlines
3. Generate a new key if needed

### Error: "Rate limit exceeded"

**Cause:** Too many requests in short time

**Solution:**
- Wait a few seconds and retry
- Reduce request frequency
- Upgrade to higher tier plan if needed

---

## Production Deployment

### Environment Variables in Production

Use your hosting platform's environment variable system:

**Heroku:**
```bash
heroku config:set OPENAI_API_KEY=sk-proj-...
heroku config:set OPENAI_MODEL=gpt-4o-mini
```

**AWS/Railway/Render:**
Use their environment variable UI to add:
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `CONFIDENCE_THRESHOLD`

### Security Hardening

1. **Use secret management** (AWS Secrets Manager, Vault)
2. **Rotate keys** automatically
3. **Monitor usage** with alerts
4. **Set strict rate limits**
5. **Enable IP allowlisting** if supported

---

## Additional Resources

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [OpenAI Pricing](https://openai.com/api/pricing/)
- [OpenAI Best Practices](https://platform.openai.com/docs/guides/production-best-practices)
- [Rate Limits Guide](https://platform.openai.com/docs/guides/rate-limits)

