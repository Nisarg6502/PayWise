/**
 * Curated bank -> card -> network catalog powering the guided "add a new
 * card" wizard. No free public API exists for this data (issuer card
 * catalogs are commercial, aggregator-maintained data), so this is a
 * hand-curated list of major Indian banks and their well-known cards.
 * Not exhaustive — the wizard always offers a manual-entry fallback for
 * anything not listed here.
 */
export interface CatalogCard {
  name: string;
  networks: string[];
}

export interface CatalogBank {
  bank: string;
  cards: CatalogCard[];
}

export const BANK_CARD_CATALOG: CatalogBank[] = [
  {
    bank: "HDFC Bank",
    cards: [
      { name: "Infinia", networks: ["Visa"] },
      { name: "Diners Club Black", networks: ["Diners Club"] },
      { name: "Regalia Gold", networks: ["Visa", "Mastercard"] },
      { name: "Millennia", networks: ["Visa", "Mastercard"] },
      { name: "Swiggy Card", networks: ["Mastercard"] },
      { name: "Tata Neu Infinity", networks: ["RuPay", "Visa"] },
      { name: "Freedom", networks: ["RuPay", "Visa"] },
    ],
  },
  {
    bank: "ICICI Bank",
    cards: [
      { name: "Amazon Pay", networks: ["Visa"] },
      { name: "Sapphiro", networks: ["Visa", "Mastercard"] },
      { name: "Coral", networks: ["Visa", "Mastercard"] },
      { name: "Emeralde", networks: ["Visa", "Mastercard"] },
      { name: "MakeMyTrip Signature", networks: ["Visa"] },
    ],
  },
  {
    bank: "Axis Bank",
    cards: [
      { name: "Ace", networks: ["Visa"] },
      { name: "Magnus", networks: ["Mastercard"] },
      { name: "Flipkart Axis Bank", networks: ["Visa", "Mastercard"] },
      { name: "Neo", networks: ["RuPay", "Visa"] },
      { name: "Vistara Signature", networks: ["Visa"] },
    ],
  },
  {
    bank: "SBI Card",
    cards: [
      { name: "Cashback", networks: ["Visa", "Mastercard"] },
      { name: "SimplyCLICK", networks: ["Visa", "Mastercard"] },
      { name: "SimplySAVE", networks: ["Visa", "Mastercard"] },
      { name: "Prime", networks: ["Visa", "Mastercard"] },
      { name: "Elite", networks: ["Visa", "Mastercard"] },
    ],
  },
  {
    bank: "Kotak Mahindra Bank",
    cards: [
      { name: "League Platinum", networks: ["Mastercard"] },
      { name: "Royale Signature", networks: ["Visa", "Mastercard"] },
      { name: "811 #Dream Different", networks: ["Visa"] },
    ],
  },
  {
    bank: "IDFC FIRST Bank",
    cards: [
      { name: "FIRST Millennia", networks: ["Visa"] },
      { name: "FIRST WOW", networks: ["RuPay"] },
      { name: "FIRST Select", networks: ["Visa"] },
    ],
  },
  {
    bank: "American Express",
    cards: [
      { name: "Membership Rewards", networks: ["American Express"] },
      { name: "Platinum Travel", networks: ["American Express"] },
      { name: "SmartEarn", networks: ["American Express"] },
    ],
  },
  {
    bank: "Standard Chartered",
    cards: [
      { name: "Ultimate", networks: ["Visa"] },
      { name: "Rewards", networks: ["Visa", "Mastercard"] },
      { name: "EaseMyTrip", networks: ["Visa"] },
    ],
  },
  {
    bank: "RBL Bank",
    cards: [
      { name: "World Safari", networks: ["Visa"] },
      { name: "ShopRite", networks: ["Mastercard"] },
      { name: "Icon", networks: ["Visa", "Mastercard"] },
    ],
  },
  {
    bank: "Yes Bank",
    cards: [
      { name: "Marquee", networks: ["Visa"] },
      { name: "Prosperity Edge", networks: ["RuPay"] },
      { name: "First Exclusive", networks: ["Visa"] },
    ],
  },
  {
    bank: "AU Small Finance Bank",
    cards: [
      { name: "Zenith", networks: ["Visa"] },
      { name: "LIT Credit Card", networks: ["Visa"] },
    ],
  },
];
