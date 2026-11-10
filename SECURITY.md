# Security Policy

## Supported versions

The `main` branch is the supported release. Security fixes land there first.

## Reporting a vulnerability

Please **do not open a public issue** for a security problem.

Email **me@andrewriefenstahl.com** with:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- The affected endpoint, page, or commit if known

Do not include real user data, API keys, Clerk tokens, or database dumps in the report. I will acknowledge the report and coordinate a fix and disclosure timeline.

## Scope

In scope:

- Authentication and authorization bypasses
- Cross-user data access
- Injection, SSRF, and unsafe deserialization
- Leaks of secrets, tokens, or personal data
- Denial of service caused by an unbounded request or response

Out of scope:

- Findings that require a compromised device or browser extension
- Missing security headers without an demonstrated impact
- Automated scanner output without a reproducible issue

## Handling secrets

- Never commit `.env`, database dumps, or credentials.
- Production secrets live only in the deployment platform.
- If a secret is exposed, rotate it first; deleting the file is not enough.
