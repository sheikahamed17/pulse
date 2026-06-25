import type { MoneyAgentResponse } from '@/lib/agents/schemas/money-agent-response'

export type Case = {
  id: string
  text: string
  bucket: 'happy' | 'currency' | 'amount' | 'direction' | 'date' | 'category' | 'failure'
  expect: Partial<MoneyAgentResponse>
  expectNull?: Array<keyof MoneyAgentResponse>
}

export const TEST_CATEGORIES = [
  { name: 'Food', kind: 'spend' as const },
  { name: 'Transport', kind: 'spend' as const },
  { name: 'Rent', kind: 'spend' as const },
  { name: 'Bills', kind: 'spend' as const },
  { name: 'Entertainment', kind: 'spend' as const },
  { name: 'Health', kind: 'spend' as const },
  { name: 'Shopping', kind: 'spend' as const },
  { name: 'Personal', kind: 'spend' as const },
  { name: 'Misc', kind: 'spend' as const },
  { name: 'Salary', kind: 'income' as const },
  { name: 'Freelance', kind: 'income' as const },
  { name: 'Refund', kind: 'income' as const },
  { name: 'Investment', kind: 'income' as const },
  { name: 'Gift', kind: 'income' as const },
]

export const CASES: Case[] = [
  // ----- happy path (10) -----
  { id: 'h-01', bucket: 'happy', text: 'spent 80 on chai',
    expect: { amount: 8000, currency: 'INR', direction: 'out', category_name: 'Food' } },
  { id: 'h-02', bucket: 'happy', text: 'paid 250 for lunch',
    expect: { amount: 25000, currency: 'INR', direction: 'out', category_name: 'Food' } },
  { id: 'h-03', bucket: 'happy', text: 'got salary 85000',
    expect: { amount: 8500000, currency: 'INR', direction: 'in', category_name: 'Salary' } },
  { id: 'h-04', bucket: 'happy', text: 'bought a book 350',
    expect: { amount: 35000, currency: 'INR', direction: 'out', category_name: 'Shopping' } },
  { id: 'h-05', bucket: 'happy', text: 'metro ride 30 rupees',
    expect: { amount: 3000, currency: 'INR', direction: 'out', category_name: 'Transport' } },
  { id: 'h-06', bucket: 'happy', text: 'paid electricity bill 1200',
    expect: { amount: 120000, currency: 'INR', direction: 'out', category_name: 'Bills' } },
  { id: 'h-07', bucket: 'happy', text: 'netflix 199',
    expect: { amount: 19900, currency: 'INR', direction: 'out', category_name: 'Entertainment' } },
  { id: 'h-08', bucket: 'happy', text: 'freelance project paid 25000',
    expect: { amount: 2500000, currency: 'INR', direction: 'in', category_name: 'Freelance' } },
  { id: 'h-09', bucket: 'happy', text: 'pharmacy 450',
    expect: { amount: 45000, currency: 'INR', direction: 'out', category_name: 'Health' } },
  { id: 'h-10', bucket: 'happy', text: 'birthday gift from mom 1000',
    expect: { amount: 100000, currency: 'INR', direction: 'in', category_name: 'Gift' } },

  // ----- currency parsing (8) -----
  { id: 'c-01', bucket: 'currency', text: '5 dollars coffee',
    expect: { amount: 500, currency: 'USD', direction: 'out' } },
  { id: 'c-02', bucket: 'currency', text: '$12.50 for lunch',
    expect: { amount: 1250, currency: 'USD', direction: 'out' } },
  { id: 'c-03', bucket: 'currency', text: '€20 train ticket',
    expect: { amount: 2000, currency: 'EUR', direction: 'out', category_name: 'Transport' } },
  { id: 'c-04', bucket: 'currency', text: 'paid 150 dirhams at the cafe',
    expect: { amount: 15000, currency: 'AED', direction: 'out', category_name: 'Food' } },
  { id: 'c-05', bucket: 'currency', text: '1500 yen ramen',
    expect: { amount: 1500, currency: 'JPY', direction: 'out', category_name: 'Food' } },
  { id: 'c-06', bucket: 'currency', text: '20 quid dinner',
    expect: { amount: 2000, currency: 'GBP', direction: 'out', category_name: 'Food' } },
  { id: 'c-07', bucket: 'currency', text: '₹500 movie',
    expect: { amount: 50000, currency: 'INR', direction: 'out', category_name: 'Entertainment' } },
  { id: 'c-08', bucket: 'currency', text: '40 SGD shopping at orchard',
    expect: { amount: 4000, currency: 'SGD', direction: 'out', category_name: 'Shopping' } },

  // ----- amount edge cases (8) -----
  { id: 'a-01', bucket: 'amount', text: '80.50 for masala chai',
    expect: { amount: 8050, currency: 'INR', direction: 'out', category_name: 'Food' } },
  { id: 'a-02', bucket: 'amount', text: 'paid 1 lakh down payment',
    expect: { amount: 10000000, currency: 'INR', direction: 'out' } },
  { id: 'a-03', bucket: 'amount', text: 'got 1.5 crore from investor',
    expect: { amount: 15000000000, currency: 'INR', direction: 'in' } },
  { id: 'a-04', bucket: 'amount', text: 'spent 5k on shoes',
    expect: { amount: 500000, currency: 'INR', direction: 'out', category_name: 'Shopping' } },
  { id: 'a-05', bucket: 'amount', text: 'paid 25k rent',
    expect: { amount: 2500000, currency: 'INR', direction: 'out', category_name: 'Rent' } },
  { id: 'a-06', bucket: 'amount', text: 'spent 80',
    expect: { amount: 8000, currency: 'INR', direction: 'out' } },
  { id: 'a-07', bucket: 'amount', text: 'bought a book',
    expect: { amount: 0, currency: 'INR', direction: 'out' } },
  { id: 'a-08', bucket: 'amount', text: 'lunch around 200 to 300',
    expect: { currency: 'INR', direction: 'out', category_name: 'Food' } },

  // ----- direction ambiguity (6) -----
  { id: 'd-01', bucket: 'direction', text: 'lent friend 500',
    expect: { amount: 50000, currency: 'INR', direction: 'out' } },
  { id: 'd-02', bucket: 'direction', text: 'friend paid me back 500',
    expect: { amount: 50000, currency: 'INR', direction: 'in' } },
  { id: 'd-03', bucket: 'direction', text: 'refund 1200 from amazon',
    expect: { amount: 120000, currency: 'INR', direction: 'in', category_name: 'Refund' } },
  { id: 'd-04', bucket: 'direction', text: 'I owe 800 to ravi',
    expect: { amount: 80000, currency: 'INR', direction: 'out' } },
  { id: 'd-05', bucket: 'direction', text: 'credit card cashback 250',
    expect: { amount: 25000, currency: 'INR', direction: 'in' } },
  { id: 'd-06', bucket: 'direction', text: 'paid the maid 3000',
    expect: { amount: 300000, currency: 'INR', direction: 'out' } },

  // ----- date parsing (5) -----
  { id: 't-01', bucket: 'date', text: 'spent 80 on chai yesterday',
    expect: { amount: 8000, direction: 'out' } },
  { id: 't-02', bucket: 'date', text: 'got salary 85000 last week',
    expect: { amount: 8500000, direction: 'in' } },
  { id: 't-03', bucket: 'date', text: 'bought milk this morning 60',
    expect: { amount: 6000, direction: 'out' } },
  { id: 't-04', bucket: 'date', text: 'last Tuesday paid 220 for uber',
    expect: { amount: 22000, direction: 'out' } },
  { id: 't-05', bucket: 'date', text: 'an hour ago spent 90 on samosa',
    expect: { amount: 9000, direction: 'out', category_name: 'Food' } },

  // ----- category inference (8) -----
  { id: 'k-01', bucket: 'category', text: 'samosa 30',
    expect: { amount: 3000, currency: 'INR', direction: 'out', category_name: 'Food' } },
  { id: 'k-02', bucket: 'category', text: 'ola airport 600',
    expect: { amount: 60000, direction: 'out', category_name: 'Transport' } },
  { id: 'k-03', bucket: 'category', text: 'spotify 119 monthly',
    expect: { amount: 11900, direction: 'out', category_name: 'Entertainment' } },
  { id: 'k-04', bucket: 'category', text: 'apollo pharmacy 750',
    expect: { amount: 75000, direction: 'out', category_name: 'Health' } },
  { id: 'k-05', bucket: 'category', text: 'flipkart shoes 2400',
    expect: { amount: 240000, direction: 'out', category_name: 'Shopping' } },
  { id: 'k-06', bucket: 'category', text: 'petrol 1500',
    expect: { amount: 150000, direction: 'out', category_name: 'Transport' } },
  { id: 'k-07', bucket: 'category', text: 'TCS deposit 92000',
    expect: { amount: 9200000, direction: 'in', category_name: 'Salary' } },
  { id: 'k-08', bucket: 'category', text: 'haircut 350',
    expect: { amount: 35000, direction: 'out', category_name: 'Personal' } },

  // ----- failure modes (5) -----
  { id: 'f-01', bucket: 'failure', text: '',
    expect: { amount: 0, direction: 'out' } },
  { id: 'f-02', bucket: 'failure', text: 'asdfgh qwerty',
    expect: { amount: 0, direction: 'out' } },
  { id: 'f-03', bucket: 'failure', text: '500',
    expect: { amount: 50000, currency: 'INR' } },
  { id: 'f-04', bucket: 'failure', text: 'food',
    expect: { amount: 0, category_name: 'Food' } },
  { id: 'f-05', bucket: 'failure', text: 'hi there',
    expect: { amount: 0 } },
]
