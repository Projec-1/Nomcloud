export const subscriptionPlans = [
  {
    code: 'starter',
    name: 'Starter',
    prefix: 'pricing.starter',
    monthlyPrice: 60,
    annualPrice: 600,
    highlight: false,
    features: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10'],
  },
  {
    code: 'growth',
    name: 'Growth',
    prefix: 'pricing.growth',
    monthlyPrice: 100,
    annualPrice: 1000,
    highlight: true,
    features: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    prefix: 'pricing.enterprise',
    monthlyPrice: null,
    annualPrice: null,
    highlight: false,
    features: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'],
  },
] as const
