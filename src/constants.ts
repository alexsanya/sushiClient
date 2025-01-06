/* eslint-disable @typescript-eslint/no-magic-numbers */

import { Percent } from '@uniswap/sdk-core';

export const MAX_FEE_PER_GAS = 250000000000 as const;
export const MAX_PRIORITY_FEE_PER_GAS = 250000000000 as const;

export const ZERO = 0 as const;
export const ONE = 1 as const;
export const RANGE_COEFFICIENT = 2 as const;
export const PRICE_PRECISION = 3 as const;
export const SLIPPAGE_TOLERANCE = new Percent(50, 10_000);
export const ONE_THOUSAND = 1000 as const;
export const SECONDS_IN_HOUR = 3600 as const;
export const SECONDS_AGO_OBSERVATION = 10 as const;
export const TICK_MATH_BASE = 1.0001 as const;
export const MINUS_ONE = -1 as const;
