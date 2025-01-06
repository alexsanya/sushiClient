import { CHAIN_ID } from './chains/sepolia';
import { setUpFork } from './operations/setUpFork';
import { addLiquidity, reallocate } from './amm.core';
import { V3AMMimpl } from './infrastructure/v3AMM.impl';
import { envs } from './config/env';
import { JsonRpcProvider } from 'ethers';
import { Wallet } from 'ethers';
import { PositionInfo } from './datatypes';

const TIMEOUT = 70 * 1000;

describe('Test multicall', () => {
	let v3Amm: V3AMMimpl;
	let provider: JsonRpcProvider;
	let signer: Wallet;
	let lastPositionBefore: PositionInfo;
	let numOfPositionsBefore: number;

	beforeAll(async () => {
		await setUpFork(CHAIN_ID);
		await addLiquidity();
		v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
		const positions = await v3Amm.positions();
		numOfPositionsBefore = positions.length;
		lastPositionBefore = positions[positions.length - 1];
		provider = new JsonRpcProvider(envs.PROVIDER_RPC);
		signer = new Wallet(envs.USER_PRIVATE_KEY, provider);
	}, TIMEOUT);

	test(
		'should reallocate liquidity',
		async () => {
			await reallocate(numOfPositionsBefore - 1);
			const positionsAfter = await v3Amm.positions();
			expect(positionsAfter.length).toEqual(numOfPositionsBefore + 1);
			expect(positionsAfter[positionsAfter.length - 2].liquidity).toEqual(0n);
			expect(positionsAfter[positionsAfter.length - 2].tokensOwed0).toEqual(0n);
			expect(positionsAfter[positionsAfter.length - 2].tokensOwed1).toEqual(0n);
			expect(positionsAfter[positionsAfter.length - 1].liquidity).toBeGreaterThan(0);
		},
		TIMEOUT
	);
});
