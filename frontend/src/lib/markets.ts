// Pyth Hermes price feed IDs (hex) — used for real-time frontend prices
// On-chain Pyth Lazer PDAs are used for settlement in the Anchor program

export interface Market {
  symbol: string;
  name: string;
  pair: string;
  pythHermesFeedId: string;       // Pyth Hermes hex feed ID
  pythLazerOraclePDA: string;     // On-chain oracle for settlement
  tickSizeBps: number;            // 1 = 1 basis point
  tickValue: number;              // USDC per tick per contract (human-readable)
  marginPerContract: number;      // USDC per contract (human-readable)
  category: "major" | "layer1" | "defi" | "meme" | "layer2" | "solana" | "ai";
  color: string;                  // accent color for card UI
  logo: string;                   // logo URL
}

// Placeholder PDA — markets not yet initialized on-chain
const P = "11111111111111111111111111111111";

// Logo helpers
const cap = (s: string) => `https://assets.coincap.io/assets/icons/${s.toLowerCase()}@2x.png`;
const cg = (path: string) => `https://coin-images.coingecko.com/coins/images/${path}`;

export const MARKETS: Market[] = [
  // ══════════════════════════════════════════════════════════
  // MAJORS
  // ══════════════════════════════════════════════════════════
  {
    symbol: "BTC", name: "Bitcoin", pair: "BTC / USD",
    pythHermesFeedId: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
    pythLazerOraclePDA: "71wtTRDY8Gxgw56bXFt2oc6qeAbTxzStdNiC425Z51sr",
    tickSizeBps: 1, tickValue: 25, marginPerContract: 10,
    category: "major", color: "#F7931A", logo: cap("btc"),
  },
  {
    symbol: "ETH", name: "Ethereum", pair: "ETH / USD",
    pythHermesFeedId: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
    pythLazerOraclePDA: "5vaYr1hpv8yrSpu8w3K95x22byYxUJCCNCSYJtqVWPvG",
    tickSizeBps: 1, tickValue: 15, marginPerContract: 5,
    category: "major", color: "#627EEA", logo: cap("eth"),
  },
  {
    symbol: "SOL", name: "Solana", pair: "SOL / USD",
    pythHermesFeedId: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
    pythLazerOraclePDA: "ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu",
    tickSizeBps: 1, tickValue: 10, marginPerContract: 5,
    category: "major", color: "#9945FF", logo: cap("sol"),
  },
  {
    symbol: "XRP", name: "XRP", pair: "XRP / USD",
    pythHermesFeedId: "ec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "major", color: "#00AAE4", logo: cap("xrp"),
  },
  {
    symbol: "ADA", name: "Cardano", pair: "ADA / USD",
    pythHermesFeedId: "2a01deaec9e51a579277b34b122399984d0bbf57e2458a7e42fecd2829867a0d",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "major", color: "#0033AD", logo: cap("ada"),
  },
  {
    symbol: "LINK", name: "Chainlink", pair: "LINK / USD",
    pythHermesFeedId: "8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 8, marginPerContract: 4,
    category: "major", color: "#2A5ADA", logo: cap("link"),
  },
  {
    symbol: "DOT", name: "Polkadot", pair: "DOT / USD",
    pythHermesFeedId: "ca3eed9b267293f6595901c734c7525ce8ef49adafe8284606ceb307afa2ca5b",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "major", color: "#E6007A", logo: cap("dot"),
  },
  {
    symbol: "ATOM", name: "Cosmos", pair: "ATOM / USD",
    pythHermesFeedId: "b00b60f88b03a6a625a8d1c048c3f66653edf217439983d037e7222c4e612819",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "major", color: "#2E3148", logo: cap("atom"),
  },
  {
    symbol: "TON", name: "Toncoin", pair: "TON / USD",
    pythHermesFeedId: "8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "major", color: "#0098EA", logo: cap("ton"),
  },
  {
    symbol: "AVAX", name: "Avalanche", pair: "AVAX / USD",
    pythHermesFeedId: "93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 8, marginPerContract: 4,
    category: "major", color: "#E84142", logo: cap("avax"),
  },

  // ══════════════════════════════════════════════════════════
  // SOLANA ECOSYSTEM
  // ══════════════════════════════════════════════════════════
  {
    symbol: "JUP", name: "Jupiter", pair: "JUP / USD",
    pythHermesFeedId: "0a0408d619e9380abad35060f9192039ed5042fa6f82301d0e48bb52be830996",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#C4F82A", logo: cap("jup"),
  },
  {
    symbol: "RAY", name: "Raydium", pair: "RAY / USD",
    pythHermesFeedId: "91568baa8beb53db23eb3fb7f22c6e8bd303d103919e19733f2bb642d3e7987a",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#6C5CE7", logo: cap("ray"),
  },
  {
    symbol: "ORCA", name: "Orca", pair: "ORCA / USD",
    pythHermesFeedId: "37505261e557e251290b8c8899453064e8d760ed5c65a779726f2490980da74c",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#FFD15C", logo: cg("17547/large/Orca_Logo.png"),
  },
  {
    symbol: "JTO", name: "Jito", pair: "JTO / USD",
    pythHermesFeedId: "b43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#8B5CF6", logo: cap("jto"),
  },
  {
    symbol: "PYTH", name: "Pyth Network", pair: "PYTH / USD",
    pythHermesFeedId: "0bbf28e9a841a1cc788f6a361b17ca072d0ea3098a1e5df1c3922d06719579ff",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#E6DAFE", logo: cap("pyth"),
  },
  {
    symbol: "HNT", name: "Helium", pair: "HNT / USD",
    pythHermesFeedId: "649fdd7ec08e8e2a20f425729854e90293dcbe2376abc47197a14da6ff339756",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#474DFF", logo: cap("hnt"),
  },
  {
    symbol: "MOBILE", name: "Helium Mobile", pair: "MOBILE / USD",
    pythHermesFeedId: "ff4c53361e36a9b837433c87d290c229e1f01aec5ef98d9f3f70953a20a629ce",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#29D391", logo: cg("29879/large/Mobile_Icon.png"),
  },
  {
    symbol: "W", name: "Wormhole", pair: "W / USD",
    pythHermesFeedId: "eff7446475e218517566ea99e72a4abec2e1bd8498b43b7d8331e29dcb059389",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#FFFFFF", logo: cg("35087/large/W_Token_%283%29.png"),
  },
  {
    symbol: "TNSR", name: "Tensor", pair: "TNSR / USD",
    pythHermesFeedId: "05ecd4597cd48fe13d6cc3596c62af4f9675aee06e2e0b94c06d8bee2b659e05",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#FF6B6B", logo: cg("35972/large/tnsr.png"),
  },
  {
    symbol: "KMNO", name: "Kamino", pair: "KMNO / USD",
    pythHermesFeedId: "b17e5bc5de742a8a378b54c9c75442b7d51e30ada63f28d9bd28d3c0e26511a0",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#00D1B2", logo: cg("35801/large/Kamino_200x200.png"),
  },
  {
    symbol: "DRIFT", name: "Drift Protocol", pair: "DRIFT / USD",
    pythHermesFeedId: "5c1690b27bb02446db17cdda13ccc2c1d609ad6d2ef5bf4983a85ea8b6f19d07",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#E45CFF", logo: cg("37509/large/DRIFT.png"),
  },
  {
    symbol: "MNDE", name: "Marinade", pair: "MNDE / USD",
    pythHermesFeedId: "3607bf4d7b78666bd3736c7aacaf2fd2bc56caa8667d3224971ebe3c0623292a",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#4FBF9F", logo: cg("18867/large/c1.png"),
  },
  {
    symbol: "ZEUS", name: "Zeus Network", pair: "ZEUS / USD",
    pythHermesFeedId: "31558e9ccb18c151af6c52bf78afd03098a7aca1b9cf171a65b693b464c2f066",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#FFD700", logo: cg("36692/large/logo-v1.png"),
  },
  {
    symbol: "GRASS", name: "Grass", pair: "GRASS / USD",
    pythHermesFeedId: "299ac948742a799d27a1649c76035b26577ad0eb6585a5ae2a691d31f2ee90c4",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "solana", color: "#7ED321", logo: cg("40094/large/Grass.jpg"),
  },

  // ══════════════════════════════════════════════════════════
  // AI TOKENS
  // ══════════════════════════════════════════════════════════
  {
    symbol: "FET", name: "Fetch.ai", pair: "FET / USD",
    pythHermesFeedId: "7da003ada32eabbac855af3d22fcf0fe692cc589f0cfd5ced63cf0bdcc742efe",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "ai", color: "#1C1C6B", logo: cap("fet"),
  },
  {
    symbol: "TAO", name: "Bittensor", pair: "TAO / USD",
    pythHermesFeedId: "410f41de235f2db824e562ea7ab2d3d3d4ff048316c61d629c0b93f58584e1af",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 15, marginPerContract: 5,
    category: "ai", color: "#000000", logo: cap("tao"),
  },
  {
    symbol: "RENDER", name: "Render", pair: "RENDER / USD",
    pythHermesFeedId: "3d4a2bd9535be6ce8059d75eadeba507b043257321aa544717c56fa19b49e35d",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "ai", color: "#1ECBE1", logo: cap("rndr"),
  },
  {
    symbol: "IO", name: "io.net", pair: "IO / USD",
    pythHermesFeedId: "82595d1509b770fa52681e260af4dda9752b87316d7c048535d8ead3fa856eb1",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "ai", color: "#6366F1", logo: cap("io"),
  },
  {
    symbol: "ELIZAOS", name: "ElizaOS", pair: "ELIZAOS / USD",
    pythHermesFeedId: "0e0fe74b2bc91e867d7f46757faf64c5a497c11515956d7016ae97493f5f6ff4",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "ai", color: "#00D4AA", logo: cg("70556/large/elizaOS_token_logo_high_quality.png"),
  },

  // ══════════════════════════════════════════════════════════
  // DEFI
  // ══════════════════════════════════════════════════════════
  {
    symbol: "AAVE", name: "Aave", pair: "AAVE / USD",
    pythHermesFeedId: "2b9ab1e972a281585084148ba1389800799bd4be63b957507db1349314e47445",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 8, marginPerContract: 4,
    category: "defi", color: "#B6509E", logo: cap("aave"),
  },
  {
    symbol: "UNI", name: "Uniswap", pair: "UNI / USD",
    pythHermesFeedId: "78d185a741d07edb3412b09008b7c5cfb9bbbd7d568bf00ba737b456ba171501",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "defi", color: "#FF007A", logo: cap("uni"),
  },
  {
    symbol: "MKR", name: "Maker", pair: "MKR / USD",
    pythHermesFeedId: "9375299e31c0deb9c6bc378e6329aab44cb4ec52f6f0b4d3c54b1dbaf3a1f17e",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 15, marginPerContract: 5,
    category: "defi", color: "#1AAB9B", logo: cap("mkr"),
  },
  {
    symbol: "CRV", name: "Curve", pair: "CRV / USD",
    pythHermesFeedId: "a19d04ac696c7a6616d291c7e5d1377cc8be437c327b75adb5dc1bad745fcae8",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "defi", color: "#FF4C4C", logo: cap("crv"),
  },
  {
    symbol: "LDO", name: "Lido", pair: "LDO / USD",
    pythHermesFeedId: "c63e2a7f37a04e5e614c07238bedb25dcc38927fba8fe890597a593c0b2fa4ad",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "defi", color: "#00A3FF", logo: cap("ldo"),
  },
  {
    symbol: "PENDLE", name: "Pendle", pair: "PENDLE / USD",
    pythHermesFeedId: "9a4df90b25497f66b1afb012467e316e801ca3d839456db028892fe8c70c8016",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "defi", color: "#12ADC2", logo: cg("15069/large/Pendle_Logo_Normal-03.png"),
  },
  {
    symbol: "ONDO", name: "Ondo", pair: "ONDO / USD",
    pythHermesFeedId: "d40472610abe56d36d065a0cf889fc8f1dd9f3b7f2a478231a5fc6df07ea5ce3",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "defi", color: "#1652F0", logo: cap("ondo"),
  },
  {
    symbol: "ENA", name: "Ethena", pair: "ENA / USD",
    pythHermesFeedId: "b7910ba7322db020416fcac28b48c01212fd9cc8fbcbaf7d30477ed8605f6bd4",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "defi", color: "#8B5CF6", logo: cg("36530/large/ethena.png"),
  },

  // ══════════════════════════════════════════════════════════
  // LAYER 1s
  // ══════════════════════════════════════════════════════════
  {
    symbol: "SUI", name: "Sui", pair: "SUI / USD",
    pythHermesFeedId: "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer1", color: "#4DA2FF", logo: cap("sui"),
  },
  {
    symbol: "APT", name: "Aptos", pair: "APT / USD",
    pythHermesFeedId: "03ae4db29ed4ae33d323568895aa00337e658e348b37509f5372ae51f0af00d5",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer1", color: "#2DD8A3", logo: cap("apt"),
  },
  {
    symbol: "NEAR", name: "NEAR Protocol", pair: "NEAR / USD",
    pythHermesFeedId: "c415de8d2eba7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer1", color: "#00C08B", logo: cap("near"),
  },
  {
    symbol: "SEI", name: "Sei", pair: "SEI / USD",
    pythHermesFeedId: "53614f1cb0c031d4af66c04cb9c756234adad0e1cee85303795091499a4084eb",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer1", color: "#9B1C1C", logo: cap("sei"),
  },
  {
    symbol: "TIA", name: "Celestia", pair: "TIA / USD",
    pythHermesFeedId: "09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer1", color: "#7B2FF7", logo: cap("tia"),
  },
  {
    symbol: "INJ", name: "Injective", pair: "INJ / USD",
    pythHermesFeedId: "7a5bc1d2b56ad029048cd63964b3ad2776eadf812edc1a43a31406cb54bff592",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 8, marginPerContract: 4,
    category: "layer1", color: "#00F2FE", logo: cap("inj"),
  },
  {
    symbol: "FIL", name: "Filecoin", pair: "FIL / USD",
    pythHermesFeedId: "150ac9b959aee0051e4091f0ef5216d941f590e1c5e7f91cf7635b5c11628c0e",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer1", color: "#0090FF", logo: cap("fil"),
  },

  // ══════════════════════════════════════════════════════════
  // LAYER 2s
  // ══════════════════════════════════════════════════════════
  {
    symbol: "ARB", name: "Arbitrum", pair: "ARB / USD",
    pythHermesFeedId: "3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer2", color: "#28A0F0", logo: cap("arb"),
  },
  {
    symbol: "OP", name: "Optimism", pair: "OP / USD",
    pythHermesFeedId: "385f64d993f7b77d8182ed5003d97c60aa3361f3cecfe711544d2d59165e9bdf",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer2", color: "#FF0420", logo: cap("op"),
  },
  {
    symbol: "POL", name: "Polygon", pair: "POL / USD",
    pythHermesFeedId: "ffd11c5a1cfd42f80afb2df4d9f264c15f956d68153335374ec10722edd70472",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer2", color: "#8247E5", logo: cap("matic"),
  },
  {
    symbol: "STRK", name: "Starknet", pair: "STRK / USD",
    pythHermesFeedId: "6a182399ff70ccf3e06024898942028204125a819e519a335ffa4579e66cd870",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer2", color: "#FF4F00", logo: cg("26433/large/starknet.png"),
  },
  {
    symbol: "MANTA", name: "Manta", pair: "MANTA / USD",
    pythHermesFeedId: "c3883bcf1101c111e9fcfe2465703c47f2b638e21fef2cce0502e6c8f416e0e2",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "layer2", color: "#1C6EF2", logo: cg("34289/large/manta.jpg"),
  },

  // ══════════════════════════════════════════════════════════
  // MEME
  // ══════════════════════════════════════════════════════════
  {
    symbol: "DOGE", name: "Dogecoin", pair: "DOGE / USD",
    pythHermesFeedId: "dcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#C3A634", logo: cap("doge"),
  },
  {
    symbol: "SHIB", name: "Shiba Inu", pair: "SHIB / USD",
    pythHermesFeedId: "f0d57deca57b3da2fe63a493f4c25925fdfd8edf834b20f93e1f84dbd1504d4a",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#FFA409", logo: cap("shib"),
  },
  {
    symbol: "PEPE", name: "Pepe", pair: "PEPE / USD",
    pythHermesFeedId: "d69731a2e74ac1ce884fc3890f7ee324b6deb66147055249568869ed700882e4",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#16A34A", logo: cap("pepe"),
  },
  {
    symbol: "WIF", name: "dogwifhat", pair: "WIF / USD",
    pythHermesFeedId: "4ca4beeca86f0d164160323817a4e42b10010a724c2217c6ee41b54cd4cc61fc",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#D97706", logo: cap("wif"),
  },
  {
    symbol: "BONK", name: "Bonk", pair: "BONK / USD",
    pythHermesFeedId: "72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#F59E0B", logo: cap("bonk"),
  },
  {
    symbol: "TRUMP", name: "Official Trump", pair: "TRUMP / USD",
    pythHermesFeedId: "879551021853eec7a7dc827578e8e69da7e4fa8148339aa0d3d5296405be4b1a",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#B91C1C", logo: cap("trump"),
  },
  {
    symbol: "FARTCOIN", name: "Fartcoin", pair: "FARTCOIN / USD",
    pythHermesFeedId: "58cd29ef0e714c5affc44f269b2c1899a52da4169d7acc147b9da692e6953608",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#8B4513", logo: cg("50891/large/fart.jpg"),
  },
  {
    symbol: "BOME", name: "Book of Meme", pair: "BOME / USD",
    pythHermesFeedId: "30e4780570973e438fdb3f1b7ad22618b2fc7333b65c7853a7ca144c39052f7a",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#FF6B35", logo: cg("36071/large/bome.png"),
  },
  {
    symbol: "POPCAT", name: "Popcat", pair: "POPCAT / USD",
    pythHermesFeedId: "b9312a7ee50e189ef045aa3c7842e099b061bd9bdc99ac645956c3b660dc8cce",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#FF69B4", logo: cg("33760/large/popcat.jpg"),
  },
  {
    symbol: "MEW", name: "Cat in a Dogs World", pair: "MEW / USD",
    pythHermesFeedId: "514aed52ca5294177f20187ae883cec4a018619772ddce41efcc36a6448f5d5d",
    pythLazerOraclePDA: P, tickSizeBps: 1, tickValue: 5, marginPerContract: 3,
    category: "meme", color: "#4ECDC4", logo: cg("36440/large/MEW.png"),
  },
];

export const MARKET_CATEGORIES = ["all", "major", "solana", "ai", "defi", "layer1", "layer2", "meme"] as const;
export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export const DEFAULT_MARKET = MARKETS[0];
