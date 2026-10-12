export interface Tier { minQty: number; unitPrice: number }
export interface ProductImage { id: number; url: string; alt: string }
export interface Product {
  id: number; slug: string; name: string; description: string; piecesPerBox: number;
  specs: { label: string; value: string }[]; inStock: boolean; stock: number; images: ProductImage[]; tiers: Tier[];
}
export interface Campaign {
  id: number; name: string; festival: string;
  theme: { primary: string; accent: string; dark: string; bg: string; text: string };
  hero: { desktopImage: string; mobileImage: string; heading: string; subheading: string; ctaText: string };
  promo_heading: string; promo_description: string; offer_text: string;
}
export interface SiteConfig {
  brand: { name: string; tagline: string; logoUrl: string; faviconUrl: string; ownerName: string };
  contact: { whatsapp: string; phone: string; email: string; address: string; pin: string; openTime: string; closeTime: string; instagram: string; facebook: string };
  delivery: { flatFee: number | null; ratePerKm: number; roundUpKm: boolean; maxRadiusKm: number | null; promiseHours: number; blackoutDates: string[]; dailyCapacity: number | null; freeWithinBasePin: boolean };
  payment: { upi: boolean; cash: boolean; upiId: string; upiNote: string };
  site: {
    announcement: string; currency: string;
    showSections: { howItWorks: boolean; delivery: boolean; gallery: boolean; faq: boolean };
    howItWorks: { title: string; text: string }[]; faq: { q: string; a: string }[];
    footerText: string; whatsappGreeting: string; privacyText: string; termsText: string;
  };
  campaign: Campaign | null;
  products: Product[];
}
export interface Estimate {
  lines: { productId: number; name: string; quantity: number; unitPrice: number; total: number; saved: number }[];
  subtotal: number; saved: number; deliveryFee: number; total: number; totalIsFinal: boolean; window: string; notes: string[];
  delivery: { status: 'ok' | 'manual_review' | 'out_of_range'; billedKm: number | null; ratePerKm: number; fee: number; note: string } | null;
}
export interface PlacedOrder {
  ref: string; status: string; customerName: string; address: string; pin: string;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number; deliveryFee: number; total: number; needsReview: boolean;
  quote: { status: string; billedKm: number | null; note: string } | null;
}
