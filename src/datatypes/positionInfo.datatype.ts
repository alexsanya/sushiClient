import type JSBI from 'jsbi';

export interface PositionInfo {
	tokenId: JSBI;
	tickLower: number;
	tickUpper: number;
	token0: string;
	token1: string;
	liquidity: JSBI;
	feeGrowthInside0LastX128: JSBI;
	feeGrowthInside1LastX128: JSBI;
	tokensOwed0: JSBI;
	tokensOwed1: JSBI;
	TWAP: string;
	currentPrice: string;
	priceRange: string[];
}
