import { useEffect } from 'react';
import { PricingSection, SiteFooter } from './Landing';

export function PricingPage() {
  useEffect(() => {
    document.title = 'Pricing | FamPlan';
  }, []);
  return (
    <div className="bg-surface-warm">
      <PricingSection />
      <SiteFooter />
    </div>
  );
}
