# Security policy

## Supported scope

The current repository is a synthetic portfolio preview under active development. Security fixes apply to the current `main` branch. There is no deployed service, customer environment, authentication boundary, security certification, or supported production release.

## Reporting a vulnerability

Report suspected vulnerabilities privately to the repository owner through the repository's private security-reporting channel or the private contact channel through which access was provided. Include the affected revision, reproduction steps, impact, and the minimum synthetic proof required. Do not include secrets, real personal data, patient data, employer data, or exploit details in a public issue.

The owner will acknowledge, assess, remediate, verify, and coordinate any disclosure. No fixed response-time commitment is claimed for this development repository.

## Preview boundaries

- Every bundled record is fictional and synthetic.
- Role preview switching is not authentication, authorization, or tenant isolation.
- Do not submit patient, staff, employer, client, payroll, credential, or compliance-evidence data.
- Mutations affect only the configured preview database.
- PGlite operation requires one writer and is not horizontally scalable.
- CORS, rate limiting, security headers, safe error envelopes, request IDs, log redaction, and health checks reduce preview risk; they do not create an identity or production-security boundary.

Dependencies are lockfile-installed and production dependencies are audited in CI. Automated checks supplement owner review and do not establish compliance with a security standard.
