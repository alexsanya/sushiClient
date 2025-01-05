import {
	type CollectOptions,
	computePoolAddress,
	type FeeAmount,
	type MintOptions,
	nearestUsableTick,
	NonfungiblePositionManager,
	Pool,
	Position,
	type RemoveLiquidityOptions,
	tickToPrice
} from '@uniswap/v3-sdk';
import { CHAIN_CONFIGS } from '../../chains';
import { type Contract, ethers, JsonRpcProvider, type TransactionRequest, type Wallet } from 'ethers';
import { envs } from '../config/env';
import { type LiquidityDTO } from '../dtos';
import { type BigintIsh, CurrencyAmount, type Percent, type Token } from '@uniswap/sdk-core';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import JSBI from 'jsbi';
import {
	ONE,
	ONE_THOUSAND,
	RANGE_COEFFICIENT,
	SECONDS_AGO_OBSERVATION,
	SECONDS_IN_HOUR,
	SLIPPAGE_TOLERANCE,
	ZERO
} from '../constants';
import { getPriceFromTick } from '../utils';

const MAX_FEE_PER_GAS = 250000000000;
const MAX_PRIORITY_FEE_PER_GAS = 250000000000;

export class LiquidityHelper {
	private readonly user: Wallet;
	private readonly tokenA: Token;
	private readonly tokenB: Token;
	private readonly amountA: BigintIsh;
	private readonly amountB: BigintIsh;
	private readonly poolFee: FeeAmount;
	private readonly provider: JsonRpcProvider;
	private readonly poolFactoryContractAddress: string;
	private readonly nonfungiblePositionManagerAddress: string;

	constructor(chainId: string, user: Wallet, liquidityDTO: LiquidityDTO) {
		this.user = user;
		this.tokenA = liquidityDTO.tokenA;
		this.tokenB = liquidityDTO.tokenB;
		this.amountA = liquidityDTO.amountA;
		this.amountB = liquidityDTO.amountB;
		this.poolFee = liquidityDTO.poolFee;
		if (typeof envs.PROVIDER_RPC !== 'string') {
			throw new Error('PROVIDER_RPC is not provided');
		}
		this.provider = new JsonRpcProvider(envs.PROVIDER_RPC);
		this.poolFactoryContractAddress = CHAIN_CONFIGS[chainId].POOL_FACTORY_CONTRACT_ADDRESS;
		this.nonfungiblePositionManagerAddress = CHAIN_CONFIGS[chainId].NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS;
	}

	async getCurrentPrice(): Promise<string> {
		const poolContract = this.getPoolContract();
		const { tick } = (await poolContract.slot0()) as { tick: JSBI };
		const currentPrice = getPriceFromTick(tick);
		return currentPrice;
	}

	async getTWAP(): Promise<string> {
		const poolContract = this.getPoolContract();
		const secondsBetween = BigInt(SECONDS_AGO_OBSERVATION);
		try {
			const observations = await poolContract.observe([secondsBetween, ZERO]);
			const { tickCumulatives } = observations;
			const diffTickCumulative = tickCumulatives[ZERO] - tickCumulatives[ONE];
			const averageTick = BigInt(diffTickCumulative) / secondsBetween;
			return tickToPrice(this.tokenA, this.tokenB, Number(averageTick)).toFixed();
		} catch (error) {
			return 'unknown';
		}
	}

	async buildAddLiquidityTransaction(): Promise<TransactionRequest> {
		const poolContract = this.getPoolContract();
		const pool = await this.getConfiguredPool(poolContract);

		const position = this.getPosition(pool);
		const transaction = this.buildMintTransaction(this.user.address, position);
		return transaction;
	}

	async buildWithdrawLiquidityTransaction(
		tokenId: BigintIsh,
		liquidityPercentage: Percent
	): Promise<TransactionRequest> {
		const poolContract = this.getPoolContract();
		const pool = await this.getConfiguredPool(poolContract);
		const currentPosition = this.getPosition(pool);
		const collectOptions: Omit<CollectOptions, 'tokenId'> = {
			expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(this.tokenA, ZERO),
			expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(this.tokenB, ZERO),
			recipient: this.user.address
		};
		const removeLiquidityOptions: RemoveLiquidityOptions = {
			deadline: Math.floor(Date.now() / ONE_THOUSAND) + SECONDS_IN_HOUR,
			slippageTolerance: SLIPPAGE_TOLERANCE,
			tokenId: JSBI.BigInt(tokenId.toString()),
			// percentage of liquidity to remove
			liquidityPercentage,
			collectOptions
		};

		return this.buildWithdrawTransaction(currentPosition, removeLiquidityOptions);
	}

	private getPosition(configuredPool: Pool): Position {
		return Position.fromAmounts({
			pool: configuredPool,
			tickLower:
				nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) -
				configuredPool.tickSpacing * RANGE_COEFFICIENT,
			tickUpper:
				nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) +
				configuredPool.tickSpacing * RANGE_COEFFICIENT,
			amount0: this.amountA,
			amount1: this.amountB,
			useFullPrecision: true
		});
	}

	private getMintOptions(recipient: string): MintOptions {
		return {
			recipient,
			deadline: Math.floor(Date.now() / ONE_THOUSAND) + SECONDS_IN_HOUR,
			slippageTolerance: SLIPPAGE_TOLERANCE
		};
	}

	private buildMintTransaction(from: string, position: Position): TransactionRequest {
		const { calldata, value } = NonfungiblePositionManager.addCallParameters(position, this.getMintOptions(from));
		console.debug({ calldata, value });
		return {
			data: calldata,
			to: this.nonfungiblePositionManagerAddress,
			value,
			from,
			maxFeePerGas: MAX_FEE_PER_GAS,
			maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
		};
	}

	private buildWithdrawTransaction(
		currentPosition: Position,
		removeLiquidityOptions: RemoveLiquidityOptions
	): TransactionRequest {
		const { calldata, value } = NonfungiblePositionManager.removeCallParameters(
			currentPosition,
			removeLiquidityOptions
		);
		return {
			data: calldata,
			to: this.nonfungiblePositionManagerAddress,
			value,
			from: this.user.address,
			maxFeePerGas: MAX_FEE_PER_GAS,
			maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
		};
	}

	private getPoolContract(): Contract {
		const currentPoolAddress = computePoolAddress({
			factoryAddress: this.poolFactoryContractAddress,
			tokenA: this.tokenA,
			tokenB: this.tokenB,
			fee: this.poolFee
		});
		return new ethers.Contract(currentPoolAddress, IUniswapV3PoolABI.abi, this.provider);
	}

	private async getConfiguredPool(poolContract: Contract): Promise<Pool> {
		const [liquidity, slot0] = await Promise.all([poolContract.liquidity(), poolContract.slot0()]);

		console.debug({ liquidity, slot0 });

		return new Pool(
			this.tokenA,
			this.tokenB,
			this.poolFee,
			slot0.sqrtPriceX96.toString() as string,
			liquidity.toString() as string,
			Number(slot0.tick)
		);
	}
}
