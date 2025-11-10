# Documentation Index

Complete documentation for the Advanced Notes ASR project.

---

## 📚 Table of Contents

### Getting Started
- **[Environment Setup](./environment-setup.md)** - OpenAI API keys, environment variables, cost estimates
- **[Main README](../README.md)** - Project overview, quick start, installation

### Deployment
- **[Railway Deployment Guide](./railway-deployment.md)** - Production deployment on Railway (architecture, environment variables, monitoring)

### Technical Specifications
- **[Semantic Organization Spec](./semantic-organization-spec.md)** - AI-powered note categorization architecture
- **[REST API Reference](./api-reference.md)** - Complete API endpoint documentation

### Development Guides
- **Cursor Rules** (`.cursor/rules/`)
  - [Project Overview](../.cursor/rules/project-overview.md)
  - [Coding Standards](../.cursor/rules/coding-standards.md)
  - [Development Workflow](../.cursor/rules/development-workflow.md)

---

## 📖 Quick Links

### For New Developers

1. Read [Main README](../README.md) for project overview
2. Follow [Environment Setup](./environment-setup.md) to configure API keys
3. Review [Coding Standards](../.cursor/rules/coding-standards.md)
4. Check [Development Workflow](../.cursor/rules/development-workflow.md) for daily development

### For Contributors

- **Coding Standards**: See [coding-standards.md](../.cursor/rules/coding-standards.md)
- **Git Workflow**: Documented in [development-workflow.md](../.cursor/rules/development-workflow.md)
- **Architecture**: See [semantic-organization-spec.md](./semantic-organization-spec.md)

### For Operators

- **Environment Setup**: [environment-setup.md](./environment-setup.md)
- **API Configuration**: See environment setup guide
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
├── README.md                        # This file (index)
├── environment-setup.md             # Environment variables, API keys
├── semantic-organization-spec.md    # Technical specification
└── [future-docs].md                 # Additional documentation
```

### Writing Style

- **Clear and concise** - Get to the point quickly
- **Step-by-step** - Use numbered lists for procedures
- **Examples** - Show, don't just tell
- **Troubleshooting** - Include common errors and solutions
- **Links** - Reference other docs and external resources

---

## 🔍 Document Summaries

### Environment Setup
**Purpose**: Configure OpenAI API keys and environment variables  
**Audience**: Developers, DevOps  
**Topics**: API key generation, costs, security, troubleshooting  
**Est. Time**: 10 minutes

### Semantic Organization Spec
**Purpose**: Technical architecture for AI-powered note organization  
**Audience**: Engineers, Architects  
**Topics**: System design, AI categorization, storage layer, UI components  
**Est. Time**: 30 minutes

### REST API Reference
**Purpose**: Complete documentation of all backend API endpoints  
**Audience**: Frontend Developers, API Consumers  
**Topics**: Endpoints, request/response formats, error handling, testing  
**Est. Time**: 20 minutes

### Project Overview (Cursor Rule)
**Purpose**: High-level project context for AI assistants  
**Audience**: AI/Developers  
**Topics**: Tech stack, directory structure, model information  
**Est. Time**: 15 minutes

### Coding Standards (Cursor Rule)
**Purpose**: Code quality guidelines and patterns  
**Audience**: Developers  
**Topics**: Python/Flask patterns, TypeScript/React patterns, Git commits  
**Est. Time**: 20 minutes

### Development Workflow (Cursor Rule)
**Purpose**: Daily development practices and procedures  
**Audience**: Developers  
**Topics**: Setup, debugging, testing, troubleshooting  
**Est. Time**: 25 minutes

---

## 📅 Maintenance

### Keeping Documentation Up-to-Date

- **Review quarterly** - Check for outdated information
- **Update with code changes** - Keep docs in sync with implementation
- **Version appropriately** - Note breaking changes
- **Archive old docs** - Move deprecated docs to `docs/archive/`

### Documentation Checklist

When adding new features:
- [ ] Update relevant technical specs
- [ ] Add environment variables to setup guide
- [ ] Update coding standards if new patterns introduced
- [ ] Add troubleshooting section if complex
- [ ] Update this index with new documents

---

## 🤝 Contributing to Docs

Found an error or want to improve documentation?

1. Create a branch: `git checkout -b docs/improve-setup-guide`
2. Make your changes in `docs/` folder
3. Update this index if adding new docs
4. Commit with clear message: `docs: Clarify OpenAI API key setup`
5. Submit pull request

---

## 📞 Getting Help

- **Technical Questions**: See [semantic-organization-spec.md](./semantic-organization-spec.md)
- **Setup Issues**: Check [environment-setup.md](./environment-setup.md) troubleshooting
- **Development Help**: Review [development-workflow.md](../.cursor/rules/development-workflow.md)
- **Code Questions**: See [coding-standards.md](../.cursor/rules/coding-standards.md)

---

**Last Updated**: November 10, 2025  
**Maintained By**: Development Team

