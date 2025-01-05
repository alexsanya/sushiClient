import { BigintIsh, Token } from '@uniswap/sdk-core';
import { FeeAmount } from '@uniswap/v3-sdk';

export class LiquidityDTO {
	constructor(
		public tokenA: Token,
		public tokenB: Token,
		public amountA: BigintIsh,
		public amountB: BigintIsh,
		public poolFee: FeeAmount
	) {}
}
