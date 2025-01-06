import { type BigintIsh, Token } from '@uniswap/sdk-core';
import { CHAIN_CONFIGS } from '../chains';
import { envs } from './config/env';
import { RANGE_COEFFICIENT, RANGE_COEFFICIENT_NEW } from './constants';
import { V3AMMimpl } from './infrastructure/v3AMM.impl';
import { LiquidityDTO } from './dtos';
import { type FeeAmount } from '@uniswap/v3-sdk';

export async function positions(): Promise<void> {
	const v3Amm = new V3AMMimpl((envs as Record<string, string>).CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	const positions = await v3Amm.positions();
	console.log(positions);
}

export async function collectAllFees(tokenId: BigintIsh): Promise<void> {
	const v3Amm = new V3AMMimpl((envs as Record<string, string>).CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	void (await v3Amm.collectAllFees(tokenId as string));
}

export async function reallocate(positionIndex: number): Promise<void> {
	const chainId = (envs as Record<string, string>).CHAIN_ID;
	const { CHAIN_ID, AMOUNT_A_NEW, AMOUNT_B_NEW } = CHAIN_CONFIGS[chainId];
	const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	void (await v3Amm.reallocate(getLiquidityDTO(AMOUNT_A_NEW, AMOUNT_B_NEW, RANGE_COEFFICIENT_NEW), positionIndex));
}

export function getLiquidityDTO(amountA: BigintIsh, amountB: BigintIsh, rangeCoefficient: number): LiquidityDTO {
	const chainId = (envs as Record<string, string>).CHAIN_ID;
	const { CHAIN_ID, POOL_FEE, TOKEN_A_ADDRESS, TOKEN_B_ADDRESS, TOKEN_A_DECIMALS, TOKEN_B_DECIMALS } =
		CHAIN_CONFIGS[chainId];
	const tokenA: Token = new Token(Number(CHAIN_ID), TOKEN_A_ADDRESS, TOKEN_A_DECIMALS);
	const tokenB: Token = new Token(Number(CHAIN_ID), TOKEN_B_ADDRESS, TOKEN_B_DECIMALS);
	const poolFee: FeeAmount = POOL_FEE;
	return new LiquidityDTO(tokenA, tokenB, amountA, amountB, poolFee, rangeCoefficient);
}

export async function addLiquidity(): Promise<void> {
	const chainId = (envs as Record<string, string>).CHAIN_ID;
	const { CHAIN_ID, AMOUNT_A, AMOUNT_B } = CHAIN_CONFIGS[chainId];
	const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	void (await v3Amm.addLiquidity(getLiquidityDTO(AMOUNT_A, AMOUNT_B, RANGE_COEFFICIENT)));
}

export async function withdrawLiquidity(positionIndex: number): Promise<void> {
	const chainId = (envs as Record<string, string>).CHAIN_ID;
	const { CHAIN_ID } = CHAIN_CONFIGS[chainId];
	const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	void (await v3Amm.withdrawLiquidity(positionIndex));
}
