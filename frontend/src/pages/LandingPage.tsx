import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Factory,
  Menu,
  Receipt,
  ShieldCheck,
  Truck,
  Warehouse,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCompanyProfile } from '@/hooks/useCompanyProfile'
import '@/styles/landing-theme.css'

/**
 * The public website — everything a visitor who is not a logged-in team
 * member sees at `/`. Deliberately outside `AppLayout`: no sidebar, no
 * internal nav, none of the app's own data. The one thing it shares with
 * the internal system on purpose is the company's own identity
 * (`useCompanyProfile`, the same record every printed document reads) and
 * the limestone/quarry visual language (`stone-field`, the design tokens),
 * so the public site and the software it links to read as one business.
 *
 * Everything here is either a fixed business fact (the company name, the
 * founder, the product names) or deliberately generic capability copy —
 * nothing on this page is sourced from internal figures (stock, price,
 * customers, sales), which never belong on a public page. See
 * `hooks/useCompanyProfile.tsx` / `services/api/companyProfileService.ts`
 * for the one field that *is* live: the Contact section.
 */

const NAV_LINKS = [
  { href: '#about', label: 'About' },
  { href: '#business', label: 'Business' },
  { href: '#products', label: 'Products' },
  { href: '#contact', label: 'Contact' },
]

const BUSINESS_CAPABILITIES = [
  {
    icon: Factory,
    title: 'Limestone Manufacturing',
    description: 'Processing and preparing limestone products for business requirements.',
  },
  {
    icon: Boxes,
    title: 'Production Management',
    description: 'Organized production across different product and mesh configurations.',
  },
  {
    icon: Warehouse,
    title: 'Inventory & Stock Management',
    description: 'Structured monitoring of raw materials and finished production.',
  },
  {
    icon: Receipt,
    title: 'Sales & Distribution',
    description: 'Managing customer orders, sales and product delivery operations.',
  },
]

const PRODUCTS = [
  { name: 'Vietnam White Limestone', description: 'Limestone sourced and processed for business and industrial use.' },
  { name: 'Oman Red Limestone', description: 'Limestone sourced and processed for business and industrial use.' },
  { name: 'Grey Limestone', description: 'Limestone sourced and processed for business and industrial use.' },
]

const WHY_US = [
  'Organized Production',
  'Structured Inventory Management',
  'Quality-Focused Processing',
  'Reliable Business Operations',
  'Customer-Oriented Service',
]

const WORKFLOW_STEPS = ['Raw Material', 'Production', 'Finished Products', 'Sales & Distribution']

function Nav() {
  const [open, setOpen] = useState(false)
  const { profile } = useCompanyProfile()

  return (
    <header className="no-print sticky top-0 z-40 border-b border-border/70 bg-cream-50/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-6">
        <a href="#top" className="flex items-center gap-2.5">
          {profile.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logoUrl}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg object-contain"
            />
          ) : (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-700 text-sm font-semibold text-white">
              BI
            </span>
          )}
          <span className="min-w-0">
            <span className="block font-display text-base leading-tight tracking-wide text-foreground">
              BHUIYAN INDUSTRY
            </span>
            <span className="block text-2xs uppercase tracking-[0.08em] text-muted-foreground">
              Limestone Manufacturing
            </span>
          </span>
        </a>

        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary-700"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:block">
          <Button asChild>
            <Link to="/login">Management Login</Link>
          </Button>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-lg text-foreground md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <nav
          className="border-t border-border/70 bg-cream-50 px-4 py-3 md:hidden"
          aria-label="Main"
        >
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-sm font-medium text-foreground/85 hover:bg-secondary/60"
              >
                {link.label}
              </a>
            ))}
            <Button asChild className="mt-2">
              <Link to="/login">Management Login</Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  )
}

function Hero() {
  return (
    <section id="top" className="landing-hero relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28">
      <div className="landing-fade-in mx-auto max-w-[900px] text-center">
        <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-brass-300">
          Bhuiyan Industry
        </p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-white sm:text-5xl">
          Agro-Based Limestone Manufacturing Company
        </h1>
        <p className="mx-auto mt-5 max-w-[640px] text-base text-white/75 sm:text-lg">
          Reliable limestone manufacturing and supply for modern business needs.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="px-6">
            <a href="#contact">
              Contact Us
              <ArrowRight className="h-4 w-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="border-white/25 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white">
            <Link to="/login">Management Login</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

function SectionHeading({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="mx-auto max-w-[640px] text-center">
      {eyebrow && (
        <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-brass-500">{eyebrow}</p>
      )}
      <h2 className="mt-2 font-display text-3xl text-foreground">{title}</h2>
    </div>
  )
}

function About() {
  return (
    <section id="about" className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[1100px]">
        <SectionHeading title="About Bhuiyan Industry" />
        <p className="mx-auto mt-5 max-w-[720px] text-center text-[0.9375rem] leading-relaxed text-muted-foreground">
          Bhuiyan Industry is an agro-based limestone manufacturing company focused on organized
          production, processing and supply operations. Our business combines practical
          manufacturing experience with structured inventory and sales management.
        </p>
      </div>
    </section>
  )
}

function BusinessCard({ icon: Icon, title, description }: (typeof BUSINESS_CAPABILITIES)[number]) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-raised">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary-100 text-primary-700">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}

function Business() {
  return (
    <section id="business" className="stone-field px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[1100px]">
        <SectionHeading eyebrow="What we do" title="Our Business" />
        <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BUSINESS_CAPABILITIES.map((item) => (
            <BusinessCard key={item.title} {...item} />
          ))}
        </div>
      </div>
    </section>
  )
}

function ProductCard({ name, description }: (typeof PRODUCTS)[number]) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card transition-shadow hover:shadow-raised">
      <div className="h-2 bg-gradient-to-r from-brass-300 via-brass-400 to-primary-600" aria-hidden />
      <div className="p-5">
        <h3 className="text-sm font-semibold text-foreground">{name}</h3>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function Products() {
  return (
    <section id="products" className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[1100px]">
        <SectionHeading eyebrow="What we produce" title="Our Products" />
        <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.name} {...product} />
          ))}
        </div>
      </div>
    </section>
  )
}

function WhyUs() {
  return (
    <section className="stone-field px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[1100px]">
        <SectionHeading eyebrow="Why work with us" title="Why Bhuiyan Industry" />
        <ul className="mx-auto mt-9 grid max-w-[760px] grid-cols-1 gap-3 sm:grid-cols-2">
          {WHY_US.map((point) => (
            <li key={point} className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success-700" aria-hidden />
              <span className="text-sm font-medium text-foreground">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Workflow() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-[1100px]">
        <SectionHeading eyebrow="How it works" title="Business Operations" />
        <div className="mt-10 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-2">
          {WORKFLOW_STEPS.map((step, index) => (
            <div key={step} className="flex flex-col items-center gap-2 sm:flex-row">
              <div className="flex w-40 flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-5 text-center shadow-card">
                <Truck className="h-5 w-5 text-primary-700" aria-hidden />
                <span className="text-[0.8125rem] font-semibold leading-tight text-foreground">{step}</span>
              </div>
              {index < WORKFLOW_STEPS.length - 1 && (
                <ChevronRight className="landing-flow-arrow hidden h-6 w-6 sm:block" aria-hidden />
              )}
              {index < WORKFLOW_STEPS.length - 1 && (
                <ChevronRight className="landing-flow-arrow h-6 w-6 rotate-90 sm:hidden" aria-hidden />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ManagementCta() {
  return (
    <section className="px-4 py-14 sm:px-6">
      <div className="mx-auto flex max-w-[1100px] flex-col items-center justify-between gap-5 rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-card sm:flex-row sm:text-left">
        <div className="flex items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-100 text-primary-700">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h3 className="font-display text-lg text-foreground">Business Management System</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Authorized team members can securely access the company&apos;s internal management system.
            </p>
          </div>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link to="/login">Management Login</Link>
        </Button>
      </div>
    </section>
  )
}

function Footer() {
  const { profile } = useCompanyProfile()
  const contactBits = [profile.address, profile.phone, profile.email].filter(Boolean)

  return (
    <footer id="contact" className="landing-hero no-print px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-[1100px] text-center">
        <p className="font-display text-lg text-sidebar-foreground">{profile.name}</p>
        <p className="mt-1 text-sm text-sidebar-muted">Agro-Based Limestone Manufacturing Company</p>
        {profile.ownerName && (
          <p className="mt-1 text-2xs uppercase tracking-wide text-sidebar-muted">
            {[profile.designation, profile.ownerName].filter(Boolean).join(': ')}
          </p>
        )}

        {contactBits.length > 0 && (
          <p className="mt-4 text-xs text-sidebar-muted">{contactBits.join(' · ')}</p>
        )}

        <div className="mx-auto mt-6 h-px w-16 bg-sidebar-border" />

        <p className="mt-5 text-2xs text-sidebar-muted">
          © {new Date().getFullYear()} {profile.name}. All rights reserved.
        </p>
        <Link
          to="/login"
          className="mt-2 inline-block text-2xs font-medium text-brass-300 hover:underline"
        >
          Management Login
        </Link>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main>
        <Hero />
        <About />
        <Business />
        <Products />
        <WhyUs />
        <Workflow />
        <ManagementCta />
      </main>
      <Footer />
    </div>
  )
}
