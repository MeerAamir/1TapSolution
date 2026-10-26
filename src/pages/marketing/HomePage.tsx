import { Button } from '@/components/ui/button'
import { ContactSection } from './ContactSection'
import { HeroPreview } from './HeroPreview'
import { DemoSection, Faq, Features, HowItWorks, Solutions } from './sections'
import { SiteFooter, TAGLINE } from './SiteFooter'
import { SiteHeader } from './SiteHeader'

export default function HomePage() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow-raise">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-12 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28 lg:pt-20">
            <div>
              <p className="text-[0.95rem] font-semibold text-signal">{TAGLINE}</p>
              <h1 className="mt-4 text-[2.6rem] font-extrabold leading-[1.02] tracking-[-0.035em] text-ink sm:text-[3.4rem] lg:text-[3.9rem]">
                Everything your business needs. One scan away.
              </h1>
              <p className="mt-6 max-w-[34rem] text-[1.1rem] leading-relaxed text-ink/65">
                Put your menus, documents, locations, contacts and social media behind a single QR code, then update it
                whenever you like. The printed code never has to change.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <a href="#contact">Get started</a>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <a href="#features">Explore features</a>
                </Button>
              </div>
            </div>
            <HeroPreview />
          </div>
        </section>
        <HowItWorks />
        <Features />
        <Solutions />
        <DemoSection />
        <Faq />
        <ContactSection />
      </main>
      <SiteFooter />
    </>
  )
}
