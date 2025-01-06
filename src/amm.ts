import { type BigintIsh, Token } from '@uniswap/sdk-core';
import { envs } from './config/env';
import { LiquidityDTO } from './dtos';
import { V3AMMimpl } from './infrastructure/v3AMM.impl';
import { setUpFork } from './operations/setUpFork';
import { CHAIN_CONFIGS } from '../chains';
import { type FeeAmount } from '@uniswap/v3-sdk';
import { RANGE_COEFFICIENT, RANGE_COEFFICIENT_NEW } from './constants';

// eslint-disable-next-line
(BigInt.prototype as any).toJSON = function () {
	return this.toString();
};

(() => {
	void main();
})();

async function main(): Promise<void> {
	if (!envs.USER_PRIVATE_KEY) {
		throw new Error('Private key not provided');
	}
	if (!envs.PROVIDER_RPC) {
		throw new Error('Provider rpc is not defined');
	}

	switch (envs.COMMAND) {
		case 'positions':
			console.log('Active positions:');
			await positions();
			break;
		case 'addLiquidity':
			console.log('Adding liquidity: ');
			await addLiquidity();
			break;
		case 'reallocate':
			console.log('Reallocating liquidity to new price range: ');
			await reallocate();
			break;
		case 'withdrawLiquidity':
			console.log('Withdrawing liquidity: ');
			await withdrawLiquidity();
			break;
		case 'collectAllFees':
			console.log('Collectiong fees');
			await collectAllFees();
			break;
		case 'setUp':
			console.log('Preparing chain fork: ');
			await setUpFork((envs as Record<string, string>).CHAIN_ID);
			console.log('Chain state is ready');
			break;
		default:
			console.log(`unknown command ${envs.COMMAND}`);
	}
}

async function positions(): Promise<void> {
	const v3Amm = new V3AMMimpl((envs as Record<string, string>).CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	const positions = await v3Amm.positions();
	console.log(positions);
}

async function collectAllFees(): Promise<void> {
	const v3Amm = new V3AMMimpl((envs as Record<string, string>).CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	const tokenId = envs.TOKEN_ID;
	void (await v3Amm.collectAllFees(tokenId as string));
}

async function reallocate(): Promise<void> {
	const chainId = (envs as Record<string, string>).CHAIN_ID;
	const { CHAIN_ID, AMOUNT_A_NEW, AMOUNT_B_NEW } = CHAIN_CONFIGS[chainId];
	const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	void (await v3Amm.reallocate(getLiquidityDTO(AMOUNT_A_NEW, AMOUNT_B_NEW, RANGE_COEFFICIENT_NEW)));
}

function getLiquidityDTO(amountA: BigintIsh, amountB: BigintIsh, rangeCoefficient: number): LiquidityDTO {
	const chainId = (envs as Record<string, string>).CHAIN_ID;
	const { CHAIN_ID, POOL_FEE, TOKEN_A_ADDRESS, TOKEN_B_ADDRESS, TOKEN_A_DECIMALS, TOKEN_B_DECIMALS } =
		CHAIN_CONFIGS[chainId];
	const tokenA: Token = new Token(Number(CHAIN_ID), TOKEN_A_ADDRESS, TOKEN_A_DECIMALS);
	const tokenB: Token = new Token(Number(CHAIN_ID), TOKEN_B_ADDRESS, TOKEN_B_DECIMALS);
	const poolFee: FeeAmount = POOL_FEE;
	return new LiquidityDTO(tokenA, tokenB, amountA, amountB, poolFee, rangeCoefficient);
}

async function addLiquidity(): Promise<void> {
	const chainId = (envs as Record<string, string>).CHAIN_ID;
	const { CHAIN_ID, AMOUNT_A, AMOUNT_B } = CHAIN_CONFIGS[chainId];
	const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	void (await v3Amm.addLiquidity(getLiquidityDTO(AMOUNT_A, AMOUNT_B, RANGE_COEFFICIENT)));
}

async function withdrawLiquidity(): Promise<void> {
	const chainId = (envs as Record<string, string>).CHAIN_ID;
	const { CHAIN_ID } = CHAIN_CONFIGS[chainId];
	const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	void (await v3Amm.withdrawLiquidity());
}
