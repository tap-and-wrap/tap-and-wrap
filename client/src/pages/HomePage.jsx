import Header from "../components/layout/Header";
import Footer from "../components/layout/Footer";
import HeroSection from "../components/home/HeroSection";
import CategoryPreview from "../components/home/CategoryPreview";
import ProductShowcase from "../components/home/ProductShowcase";
import ServicesPreview from "../components/home/ServicesPreview";
import HowItWorks from "../components/home/HowItWorks";
import FinalCTA from "../components/home/FinalCTA";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <CategoryPreview />
        <ProductShowcase />
        <ServicesPreview />
        <HowItWorks />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}