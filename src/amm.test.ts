import { CHAIN_ID } from '../chains/sepolia';
import { setUpFork } from './operations/setUpFork';
import { addLiquidity, collectAllFees, withdrawLiquidity } from './amm.core';
import { V3AMMimpl } from './infrastructure/v3AMM.impl';
import { envs } from './config/env';
import { ERC20_ABI } from '../abis/erc20';
import { Contract } from 'ethers';
import { JsonRpcProvider } from 'ethers';
import { Wallet } from 'ethers';

const TIMEOUT = 70 * 1000;

describe('Test amm client', () => {
	let v3Amm: V3AMMimpl;
	let provider: JsonRpcProvider;
	let signer: Wallet;

	beforeAll(async () => {
		await setUpFork(CHAIN_ID);
		provider = new JsonRpcProvider(envs.PROVIDER_RPC);
		signer = new Wallet(envs.USER_PRIVATE_KEY, provider);
	}, TIMEOUT);

	beforeEach(() => {
		v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
	});

	test(
		'should add liquidity',
		async () => {
			const positionsBefore = await v3Amm.positions();
			await addLiquidity();
			const positionsAfter = await v3Amm.positions();
			expect(positionsAfter.length - positionsBefore.length).toEqual(1);
			expect(positionsAfter[positionsAfter.length - 1].liquidity).toBeGreaterThan(0);
		},
		TIMEOUT
	);

	test(
		'should withdraw liquidity',
		async () => {
			const positionsBefore = await v3Amm.positions();
			await withdrawLiquidity(positionsBefore.length - 1);
			const positionsAfter = await v3Amm.positions();
			const position = positionsAfter[positionsAfter.length - 1];
			expect(position.liquidity).toEqual(0n);
			expect(position.tokensOwed0).toBeGreaterThan(0n);
			expect(position.tokensOwed1).toBeGreaterThan(0n);
		},
		TIMEOUT
	);

	test(
		'should collect fees',
		async () => {
			const positionsBefore = await v3Amm.positions();
			let currentPosition = positionsBefore[positionsBefore.length - 1];
			const erc20A = new Contract(currentPosition.token0, ERC20_ABI, provider);
			const erc20B = new Contract(currentPosition.token1, ERC20_ABI, provider);
			const [token0BalanceBefore, token1BalanceBefore] = await Promise.all([
				erc20A.balanceOf(signer.address),
				erc20B.balanceOf(signer.address)
			]);
			await collectAllFees(currentPosition.tokenId);
			const [token0BalanceAfter, token1BalanceAfter] = await Promise.all([
				erc20A.balanceOf(signer.address),
				erc20B.balanceOf(signer.address)
			]);
			const positionsAfter = await v3Amm.positions();
			const position = positionsAfter[positionsAfter.length - 1];
			expect(position.tokensOwed0).toEqual(0n);
			expect(position.tokensOwed1).toEqual(0n);
			expect(token0BalanceBefore + currentPosition.tokensOwed0).toEqual(token0BalanceAfter);
			expect(token1BalanceBefore + currentPosition.tokensOwed1).toEqual(token1BalanceAfter);
		},
		TIMEOUT
	);
});
