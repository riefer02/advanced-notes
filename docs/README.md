# Documentation Index

Complete documentation for the Chisos advanced notes project.

---

## 📚 Table of Contents

### Getting Started
- **[Environment Setup](./environment-setup.md)** - API keys, environment variables, cost estimates
- **[Main README](../README.md)** - Project overview, quick start, installation
- **[Agent Instructions](../AGENTS.md)** - Stack, auth, storage patterns, and verification checklist

### Architecture & Features
- **[REST API Reference](./api-reference.md)** - Complete API endpoint documentation
- **[Roadmap & Status](./roadmap.md)** - What is done, what is next, and when
- **[Sharing Architecture](./sharing-architecture.md)** - Profiles, friendships, and resource sharing
- **[Audio Recording System](./audio-recording-system.md)** - Browser recording, transcription, and playback
- **[S3 Storage Patterns](./audio-clips-s3.md)** - Audio clips, avatars, and vinyl images in S3
- **[Authentication Flow](./authentication-flow-explained.md)** - How Clerk JWTs reach the backend
- **[Clerk Setup](./clerk-authentication-setup.md)** - Initial Clerk configuration
- **[SES Notifications](./ses-notifications.md)** - Admin email notifications and SNS webhooks

### Development
- **[Contributing Guide](./contributing.md)** - Conventions, commands, code organization, debugging, and CI details
- **[Glossary](../GLOSSARY.md)** - Project-specific terms (notes, folders, tags, sharing, services)

### Deployment & Operations
- **[Railway Deployment Guide](./railway-deployment.md)** - Production deployment (architecture, environment variables, monitoring)
- **[Deployment Lessons](./deployment-lessons.md)** - Critical learnings (migrations, environment variables)
- **[Incident Runbook](./incident-runbook.md)** - Five-minute triage and recovery playbook

### Archive
- **[Archived Docs](./archive/README.md)** - Historical implementation and migration snapshots, kept for context only

---

## 📖 Quick Links

### For New Developers

1. Read [Main README](../README.md) for project overview
2. Follow [Environment Setup](./environment-setup.md) to configure API keys
3. Review [Agent Instructions](../AGENTS.md) for conventions and patterns
4. Check [Contributing Guide](./contributing.md) for daily development

### For Contributors

- **Coding Standards**: See [Agent Instructions](../AGENTS.md)
- **Git Workflow**: Documented in [contributing.md](./contributing.md)
- **Architecture**: See [roadmap.md](./roadmap.md) and [api-reference.md](./api-reference.md)

### For Operators

- **Environment Setup**: [environment-setup.md](./environment-setup.md)
- **Incident Response**: [incident-runbook.md](./incident-runbook.md)
- **Roadmap & Status**: [roadmap.md](./roadmap.md)
- **Deployment**: [railway-deployment.md](./railway-deployment.md)
- **Troubleshooting**: Available in each guide

---

## 📝 Documentation Guidelines

### Creating New Documentation

1. **Place in `docs/` folder** - Keep all documentation centralized
2. **Use Markdown** - `.md` files for consistency
3. **Add to this index** - Update the table of contents
4. **Use clear headings** - H1 for title, H2 for sections
5. **Include examples** - Code snippets, commands, screenshots

### Documentation Structure

```
docs/
├── README.md                    # This file (index)
├── environment-setup.md         # Environment variables, API keys
├── api-reference.md             # REST API reference
├── roadmap.md                   # Current status and next work
├── ...                          # Feature, deployment, and ops guides
└── archive/                     # Historical snapshots (not current)
```

### Writing Style

- **Clear and concise** - Get to the point quickly
- **Step-by-step** - Use numbered lists for procedures
- **Examples** - Show, don't just tell
- **Troubleshooting** - Include common errors and solutions
- **Links** - Reference other docs and external resources

---

## 📅 Maintenance

### Keeping Documentation Up-to-Date

- **Review quarterly** - Check for outdated information
- **Update with code changes** - Keep docs in sync with implementation
- **Version appropriately** - Note breaking changes
- **Archive old docs** - Move superseded snapshots to `docs/archive/` and note them there

### Documentation Checklist

When adding new features:
- [ ] Update relevant technical specs
- [ ] Add environment variables to setup guide
- [ ] Update coding standards in `AGENTS.md` if new patterns introduced
- [ ] Add troubleshooting section if complex
- [ ] Update this index with new documents

---

## 🤝 Contributing to Docs

Found an error or want to improve documentation?

1. Create a branch: `git checkout -b docs/improve-setup-guide`
2. Make your changes in `docs/` folder
3. Update this index if adding new docs
4. Commit with clear message: `docs: Clarify API key setup`
5. Submit pull request

---

## 📞 Getting Help

- **Status & Direction**: See [roadmap.md](./roadmap.md)
- **API Questions**: See [api-reference.md](./api-reference.md)
- **Setup Issues**: Check [environment-setup.md](./environment-setup.md) troubleshooting
- **Development Help**: Review [contributing.md](./contributing.md)
- **Code Questions**: See [Agent Instructions](../AGENTS.md)

---

**Last Updated**: November 13, 2026
**Maintained By**: Development Team
