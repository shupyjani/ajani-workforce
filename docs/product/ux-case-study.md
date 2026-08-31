# Product and UX case study

## Clean-room product problem

Healthcare workforce activity often asks people to make time-sensitive decisions across fragmented information. In this clean-room product brief, workers need to judge whether a shift suits them and whether they are ready to accept it. Managers need a clear view of staffing needs and progress. Administrators need to maintain reliable operational records without obscuring the human work behind them.

Ajani Workforce, a genuine Ajani Healthcare product currently in pre-production, explores how these moments could sit within one composed workforce experience. Every organisation, scenario and record shown is synthetic; none of it represents an existing organisation, customer, or live service.

## Intended users

### Worker

A healthcare worker who wants to understand upcoming work, the commitment involved, and readiness requirements.

### Manager

A workforce manager who wants to understand coverage progress and resolve operational gaps.

### Administrator

An operational administrator who wants to review requirement signals, support exceptions, and keep workforce activity understandable.

## Core user needs

- See what needs attention without interpreting a dense dashboard.
- Understand shift details and readiness implications before acting.
- Know whether an interaction completed and what happens next.
- Recover from empty, loading, unavailable, and error states without losing context.
- Move between individual and operational perspectives with consistent language.
- Understand which interactions persist synthetic preview data and which remain session-only.

## Journey map

| Stage | Worker need | Manager need | Administrator need | Current response |
| --- | --- | --- | --- | --- |
| Arrive | Recognise the product and current perspective. | Confirm operational context. | Understand the workspace boundary. | Branded shell, account context, breadcrumbs, and explicit role-preview label. |
| Orient | See the next shift and readiness state. | See coverage and priority signals. | See compliance and record states. | Distinct landing route for each typed role configuration. |
| Investigate | Filter opportunities, inspect completed assignments, and understand time or readiness context. | Compare coverage, assignment requests, shift states, and submitted timesheets. | Filter evidence records and inspect review history. | Responsive cards, lists, timelines, tables, URL-backed filters, and cursor pagination. |
| Act | Request/cancel a shift or draft, submit, correct and resubmit time. | Approve/decline assignments, author/cancel shifts, and approve/return time. | Decide a reviewing compliance record and observe readiness impact. | Explicit confirmation, bounded labelled forms, pending prevention, transaction-confirmed feedback, and targeted API refresh. |
| Encounter change | Understand loading, failure, or an empty result. | Recover without losing context. | Understand unavailable actions. | Natural loading, empty, validation, access, conflict, network, error, recovery, and success states. |
| Change perspective | Explore another role without a false security claim. | Preview a different operational view. | Return to a shared foundation. | Account dialog with explicit non-authentication language and purposeful routes. |

## Current experience

The entry page has evolved into one responsive application shell. Desktop users receive a persistent, descriptive sidebar. Tablet layouts reduce the sidebar to meaningful icons while preserving accessible link names. Mobile users receive a modal navigation drawer with focus containment, Escape dismissal, and restoration to the menu control.

The top bar maintains account and role-preview context, notifications, and useful breadcrumbs. Network state sits between global navigation and route content so service failures remain visible. Persisted preview data loads through runtime-validated API requests; worker shift requests and cancellations persist synthetic data only after a transaction confirms the outcome. Loading, failure, offline, conflict, retry, recovery, empty, pending, and success states remain in context without substituting fabricated success data.

The Worker journey moves from `/worker/shifts` discovery through direct shift detail to `/worker/schedule`, then uses `/worker/timesheets` for completed assignments. Draft, submitted, rejected and approved states remain explicit; rejected time can be corrected and resubmitted. Filters remain visible in the URL, availability never implies eligibility, and confirmation/pending states prevent accidental repeat submission.

The Manager keeps the established operations and coverage views, with focused queues for assignment review and timesheet decisions plus list, create and detail routes for future shifts. Assignment decisions expose readiness and live capacity context. Shift cancellation requires a useful reason and an explicit acknowledgement that active assignments will be cancelled.

The Administrator compliance route now uses persistent evidence records, summary counts and a detail/history view. Approve-current, further-information-required and rejected outcomes explain their readiness consequence. Timesheet oversight is deliberately read-only and states that approval belongs to Managers. Changing perspective always requests the matching deterministic persona while remaining explicit that role preview is not access control.

## Assumptions

- Users may arrive on mobile devices as well as desktop screens.
- Readiness information requires careful status language and cannot rely on colour alone.
- Operational confidence comes from clarity and restraint rather than large quantities of information.
- The browser and API will be deployed as distinct runtime concerns even while the backend remains a modular monolith.
- Authentication and real access decisions require a later, dedicated security design.

## Non-goals

- Designing authentication, onboarding, payroll, invoicing, evidence upload, or production scheduling workflows.
- Claiming regulatory certification, production readiness, customer adoption, or clinical use.
- Displaying real people, organisations, workforce records, performance metrics, or customer data.
- Adding speculative entities without a current product-preview consumer.
- Establishing a multi-service platform without an operational reason.

## Original design direction, refined

The visual language pairs deep navy with restrained teal, warm neutral surfaces, and a small gold signal colour. A serif display face introduces a human, editorial quality while system sans-serif text keeps operational details direct. Fine rules, generous space, and the compact Ajani monogram create hierarchy without decorative dashboard conventions.

The shell carries the original information rhythm into application routes: clear stage language, concise status areas, restrained surfaces, and status copy that always includes text. Motion is limited to useful feedback and suppressed when reduced motion is requested. Content moves from wide grids to linear mobile flows while preserving source order, heading structure, labelled data, and practical touch targets.

Role selection is intentionally described as a preview. It changes displayed navigation, never claims security, and does not restrict direct route access. All scenarios, organisations, names, IDs, dates, and operational values are synthetic.
