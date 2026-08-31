import type { LucideIcon } from 'lucide-react'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileClock,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { Badge } from '../components/ui/Badge'
import { Dialog } from '../components/ui/Dialog'
import { useRouteDocumentTitle } from '../hooks/useDocumentTitle'
import { roleDefinitions, roleNavigation, type RoleId } from '../types/navigation'

const primaryRole: RoleId = 'worker'

const roleIcons = {
  administrator: ShieldCheck,
  manager: UsersRound,
  worker: UserRound,
} as const satisfies Record<RoleId, LucideIcon>

const primaryNavLinks = [
  { href: '#product', label: 'Product' },
  { href: '#roles', label: 'Roles' },
  { href: '#capabilities', label: 'Capabilities' },
] as const

const capabilityAreas = [
  {
    description:
      'Workers browse matching opportunities by date, location and availability, and see effective eligibility before requesting a shift.',
    icon: Search,
    title: 'Shift discovery, requests and availability',
  },
  {
    description:
      'Managers see coverage at a glance, review and decide on assignment requests, and create or publish future shifts.',
    icon: UsersRound,
    title: 'Manager operations, capacity and assignment decisions',
  },
  {
    description:
      'Administrators review a readiness register and evidence records, with decisions that recalculate a shared readiness status.',
    icon: ShieldCheck,
    title: 'Compliance readiness and administrative records',
  },
  {
    description:
      'Workers draft, submit and correct timesheets; managers approve or reject; administrators keep read-only lifecycle oversight.',
    icon: FileClock,
    title: 'Timesheet and activity visibility',
  },
] as const

function PrimaryNav({
  className,
  label,
  onNavigate,
}: {
  readonly className?: string
  readonly label: string
  readonly onNavigate?: () => void
}) {
  return (
    <nav aria-label={label} className={className}>
      {primaryNavLinks.map((link) => (
        <a href={link.href} key={link.href} onClick={onNavigate}>
          {link.label}
        </a>
      ))}
    </nav>
  )
}

function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="landing-header">
      <Link aria-label="Ajani Workforce home" className="brand" to="/">
        <BrandMark />
        <span className="brand__name">
          Ajani
          <small>Workforce</small>
        </span>
      </Link>

      <PrimaryNav className="landing-header__nav" label="Primary" />

      <div className="landing-header__actions">
        <Link className="button button--secondary button--small" to={roleDefinitions[primaryRole].landingPath}>
          Explore the product
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
        <button
          aria-label="Open menu"
          className="icon-button landing-header__menu-button"
          onClick={() => { setMenuOpen(true) }}
          type="button"
        >
          <Menu aria-hidden="true" size={20} />
        </button>
      </div>

      <Dialog
        onClose={() => { setMenuOpen(false) }}
        open={menuOpen}
        title="Menu"
        variant="drawer"
      >
        <PrimaryNav
          className="landing-drawer-nav"
          label="Landing navigation"
          onNavigate={() => { setMenuOpen(false) }}
        />
        <Link
          className="button button--primary button--full"
          onClick={() => { setMenuOpen(false) }}
          to={roleDefinitions[primaryRole].landingPath}
        >
          Explore the product
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
      </Dialog>
    </header>
  )
}

function LandingHero() {
  return (
    <section aria-labelledby="hero-heading" className="landing-hero" id="product">
      <div className="landing-hero__content">
        <p className="overline">An Ajani Healthcare product</p>
        <h1 id="hero-heading">A calmer view of healthcare work.</h1>
        <p className="landing-hero__lede">
          Ajani Workforce brings shift discovery, readiness, compliance and
          timesheet activity into one connected view for healthcare teams —
          for workers, managers and administrators alike.
        </p>
        <div className="landing-status" role="group" aria-label="Product status">
          <Badge tone="information">Pre-production product</Badge>
          <Badge tone="neutral">Synthetic preview data</Badge>
        </div>
        <p className="landing-hero__disclosure">
          Every organisation, person and record shown in the previews below is
          synthetic. This is not a currently deployed healthcare service.
        </p>
        <div className="landing-hero__actions">
          <Link className="button button--primary" to={roleDefinitions[primaryRole].landingPath}>
            Preview the Worker experience
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
          <Link className="button button--secondary" to="/foundation">
            Read the product foundation
          </Link>
        </div>
      </div>
      <ProductTableau />
    </section>
  )
}

function ProductTableau() {
  return (
    <div aria-hidden="true" className="landing-tableau">
      <div className="landing-tableau__card landing-tableau__card--dark">
        <p className="overline">Your next shift · Confirmed</p>
        <strong>A clear start at Willowmere Community Hospital.</strong>
        <div className="landing-tableau__meta">
          <span><Clock3 aria-hidden="true" size={15} />07:30–15:30</span>
          <span><MapPin aria-hidden="true" size={15} />Maple Ward</span>
        </div>
      </div>
      <div className="landing-tableau__card">
        <div className="landing-tableau__card-heading">
          <span>Coverage snapshot</span>
          <Badge tone="warning">2 open</Badge>
        </div>
        <span className="coverage-track"><span style={{ width: '68%' }} /></span>
        <span className="coverage-track"><span style={{ width: '100%' }} /></span>
      </div>
      <div className="landing-tableau__card landing-tableau__card--row">
        <CheckCircle2 aria-hidden="true" size={18} />
        <span>Readiness current</span>
        <Badge tone="success">Ready</Badge>
      </div>
      <div className="landing-tableau__card landing-tableau__card--row">
        <CalendarDays aria-hidden="true" size={18} />
        <span>Timesheet submitted</span>
        <Badge tone="information">In review</Badge>
      </div>
    </div>
  )
}

function RoleJourneyCard({ role }: { readonly role: RoleId }) {
  const definition = roleDefinitions[role]
  const Icon = roleIcons[role]
  const highlights = roleNavigation[role].slice(0, 3)

  return (
    <article className="role-journey-card">
      <span className="role-journey-card__icon">
        <Icon aria-hidden="true" size={22} />
      </span>
      <h3>{definition.label}</h3>
      <p>{definition.description}</p>
      <ul>
        {highlights.map((item) => (
          <li key={item.to}>
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </li>
        ))}
      </ul>
      <Link className="text-link" to={definition.landingPath}>
        Preview the {definition.label} experience
        <ArrowRight aria-hidden="true" size={16} />
      </Link>
    </article>
  )
}

function RoleJourneys() {
  return (
    <section aria-labelledby="roles-heading" className="landing-section" id="roles">
      <div className="landing-section__heading">
        <p className="overline">Three connected journeys</p>
        <h2 id="roles-heading">One product, three ways to see it.</h2>
        <p>
          Every role shares the same connected data and design language, with
          a view built around what that role needs to do next.
        </p>
      </div>
      <div className="role-journey-grid">
        {(['worker', 'manager', 'administrator'] as const).map((role) => (
          <RoleJourneyCard key={role} role={role} />
        ))}
      </div>
    </section>
  )
}

function Capabilities() {
  return (
    <section aria-labelledby="capabilities-heading" className="landing-section" id="capabilities">
      <div className="landing-section__heading">
        <p className="overline">Implemented today</p>
        <h2 id="capabilities-heading">Genuine capability, not a roadmap slide.</h2>
        <p>
          Every area below is connected to a working, runtime-validated
          preview API — not a mockup or a planned feature.
        </p>
      </div>
      <div className="capability-grid">
        {capabilityAreas.map((area) => (
          <article className="capability-card" key={area.title}>
            <span className="capability-card__icon">
              <area.icon aria-hidden="true" size={20} />
            </span>
            <h3>{area.title}</h3>
            <p>{area.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function TrustSection() {
  return (
    <section aria-labelledby="trust-heading" className="landing-section landing-section--narrow" id="trust">
      <div className="alert alert--information landing-trust">
        <ShieldCheck aria-hidden="true" />
        <div>
          <h2 id="trust-heading">Built for real use, honest about where it is today</h2>
          <span>
            Ajani Workforce is being developed as a genuine future Ajani
            Healthcare product. It is currently pre-production: every
            organisation, person and record in this preview is synthetic, and
            it does not represent a currently deployed healthcare service.
          </span>
        </div>
      </div>
    </section>
  )
}

function ClosingCallToAction() {
  return (
    <section aria-labelledby="closing-heading" className="landing-closing" id="explore">
      <p className="overline">Ready to look inside?</p>
      <h2 id="closing-heading">Preview the experience for each role.</h2>
      <div className="landing-closing__actions">
        {(['worker', 'manager', 'administrator'] as const).map((role) => (
          <Link className="button button--secondary" key={role} to={roleDefinitions[role].landingPath}>
            {roleDefinitions[role].label} preview
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        ))}
      </div>
    </section>
  )
}

function LandingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="landing-footer">
      <div className="brand">
        <BrandMark />
        <span className="brand__name">
          Ajani
          <small>Workforce</small>
        </span>
      </div>
      <div className="landing-footer__meta">
        <p>An Ajani Healthcare product</p>
        <p>Pre-production product · Synthetic scenarios only</p>
        <p>© {year} Ajani Healthcare.</p>
      </div>
    </footer>
  )
}

export function LandingPage() {
  useRouteDocumentTitle()

  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">
        Skip to main content
      </a>
      <LandingHeader />
      <main id="landing-main" tabIndex={-1}>
        <LandingHero />
        <RoleJourneys />
        <Capabilities />
        <TrustSection />
        <ClosingCallToAction />
      </main>
      <LandingFooter />
    </div>
  )
}
