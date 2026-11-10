// ==================== BANK SETTINGS (edit freely) ====================
// DEMO values: this project has no internet connection to a bank/exchange,
// so rates and prices below are FIXED numbers that you can change by hand.

module.exports = {
    // How many KZT one unit of the currency is worth (demo rates, not live)
    RATES_TO_KZT: { KZT: 1, USD: 470 },
    CURRENCIES: ['KZT', 'USD'],

    // International transfers (SWIFT-style, simulated). Amount is always sent in USD.
    INTERNATIONAL: { feePercent: 1, feeMinUsd: 3, minUsd: 10, maxUsd: 10000 },

    // Crypto (simulated ledger - no real blockchain). Prices in USD, demo values.
    CRYPTO: {
        feeUsd: 1,
        minUsd: 5,
        assets: {
            USDT_TRC20: { asset: 'USDT', name: 'USDT (TRON, TRC20)', priceUsd: 1 },
            USDT_ERC20: { asset: 'USDT', name: 'USDT (Ethereum, ERC20)', priceUsd: 1 },
            BTC: { asset: 'BTC', name: 'Bitcoin', priceUsd: 100000 },
            ETH: { asset: 'ETH', name: 'Ethereum', priceUsd: 3500 }
        }
    },

    // Deposit interest by term in months. The SERVER decides the rate (the app cannot choose it).
    DEPOSIT_RATES: { 3: 10, 6: 11, 12: 12, 24: 13 },

    // bcc Shield (fraud protection). holdMinutes is SHORT for demos; a real bank would use 30-60+.
    SHIELD: { holdMinutes: 2, medium: 30, high: 60 },
    // Who may open the "Bank team" dashboard (by login email)
    ADMIN_EMAILS: ['demo@bcc.kz'],
    PLUS: { priceKzt: 990 },
    // Finance (PFM): ask the customer this many hours before a subscription is charged; round-up step in tenge
    PFM: { remindHours: 24, roundUpStep: 100, maxSubs: 20, maxGoals: 5 },
    LOAN: { minAmount: 50000, maxAmount: 7000000, aprPercent: 22, months: [6, 12, 24, 36, 48, 60] },
    BANK: { name: 'JSC Bank CenterCredit', swift: 'KCJBKZKX', address: '38 Al-Farabi Ave, Almaty, Kazakhstan', email: 'info@bcc.kz', website: 'https://www.bcc.kz' },

    KZ_BANKS: ['Kaspi Bank', 'Halyk Bank', 'Jusan Bank', 'Freedom Bank', 'ForteBank', 'Bereke Bank',
        'Eurasian Bank', 'Home Credit Bank', 'Altyn Bank', 'Nurbank'],

    COUNTRIES: [
        ['US', 'United States'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['FR', 'France'], ['IT', 'Italy'],
        ['ES', 'Spain'], ['NL', 'Netherlands'], ['PL', 'Poland'], ['CH', 'Switzerland'], ['TR', 'Turkey'],
        ['AE', 'United Arab Emirates'], ['CN', 'China'], ['KR', 'South Korea'], ['JP', 'Japan'], ['IN', 'India'],
        ['UZ', 'Uzbekistan'], ['KG', 'Kyrgyzstan'], ['TJ', 'Tajikistan'], ['AZ', 'Azerbaijan'], ['GE', 'Georgia'],
        ['AM', 'Armenia'], ['UA', 'Ukraine'], ['BY', 'Belarus'], ['RU', 'Russia'], ['CA', 'Canada'],
        ['AU', 'Australia'], ['SA', 'Saudi Arabia'], ['EG', 'Egypt'], ['BR', 'Brazil']
    ],

    // Country calling codes for phone numbers
    PHONE_CODES: [
        ['7', 'Kazakhstan / Russia'], ['1', 'USA / Canada'], ['44', 'United Kingdom'], ['49', 'Germany'],
        ['33', 'France'], ['39', 'Italy'], ['34', 'Spain'], ['31', 'Netherlands'], ['48', 'Poland'],
        ['41', 'Switzerland'], ['90', 'Turkey'], ['971', 'UAE'], ['966', 'Saudi Arabia'], ['86', 'China'],
        ['82', 'South Korea'], ['81', 'Japan'], ['91', 'India'], ['998', 'Uzbekistan'], ['996', 'Kyrgyzstan'],
        ['992', 'Tajikistan'], ['993', 'Turkmenistan'], ['994', 'Azerbaijan'], ['995', 'Georgia'],
        ['374', 'Armenia'], ['380', 'Ukraine'], ['375', 'Belarus'], ['20', 'Egypt'], ['55', 'Brazil'], ['61', 'Australia']
    ]
};
