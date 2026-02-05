import Hero from "@/components/solid/Hero";
import Brands from "@/components/solid/Brands";
import Feature from "@/components/solid/Features";
import About from "@/components/solid/About";
import FeaturesTab from "@/components/solid/FeaturesTab";
import FunFact from "@/components/solid/FunFact";
import Integration from "@/components/solid/Integration";
import CTA from "@/components/solid/CTA";
import FAQ from "@/components/solid/FAQ";
import Pricing from "@/components/solid/Pricing";
import Contact from "@/components/solid/Contact";
import Blog from "@/components/solid/Blog";
import Testimonial from "@/components/solid/Testimonial";

export default function Home() {
  return (
    <main>
      <Hero />
      <Brands />
      <Feature />
      <About />
      <FeaturesTab />
      <FunFact />
      <Integration />
      <CTA />
      <FAQ />
      <Testimonial />
      <Pricing />
      <Contact />
      <Blog />
    </main>
  );
}
