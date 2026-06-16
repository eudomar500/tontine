export interface SourcePreset {
  label: string;
  url: string;
}

export type CategoryPresets = Record<string, SourcePreset[]>;

export const CURATED_PRESETS: CategoryPresets = {
  Crypto: [
    { label: 'Bitcoin price (Coinbase)', url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot' },
    { label: 'Bitcoin price (Binance)', url: 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT' },
    { label: 'Ethereum price (Coinbase)', url: 'https://api.coinbase.com/v2/prices/ETH-USD/spot' },
    { label: 'Ethereum price (Binance)', url: 'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT' },
  ],
};
