import { type V3AMM } from '../../v3AMM';
import { type AddLiquidityResult, type PositionInfo, type WithdrawLiquidityResult } from '../datatypes';
import { LiquidityDTO } from '../dtos';
import { Contract, ethers, JsonRpcProvider, Wallet } from 'ethers';
import { envs } from '../config/env';
import INONFUNGIBLE_POSITION_MANAGER from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { CHAIN_CONFIGS } from '../../chains';
import { type BigintIsh, Token } from '@uniswap/sdk-core';
import { LiquidityHelper } from './LiquidityHelper';
import { type FeeAmount } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import { ERC20_ABI } from '../../abis/erc20';
import { ONE_THOUSAND, SECONDS_IN_HOUR } from '../constants';
import { getPriceFromTick } from '../utils';

interface PoolPrices {
	TWAP: string;
	current: string;
}

export class V3AMMimpl implements V3AMM {
	private readonly chainId: string;
	private readonly signer: Wallet;
	private readonly provider: JsonRpcProvider;
	private readonly nfpmContract: Contract;

	constructor(chainId: string, userPrivateKey: string) {
		this.chainId = chainId;
		this.provider = new JsonRpcProvider(envs.PROVIDER_RPC as string);
		this.signer = new Wallet(userPrivateKey, this.provider);

		this.nfpmContract = new ethers.Contract(
			CHAIN_CONFIGS[chainId].NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
			INONFUNGIBLE_POSITION_MANAGER.abi,
			this.provider
		);
	}

	async addLiquidity(addLiquidityDTO: LiquidityDTO): Promise<AddLiquidityResult> {
		const addLiquidityHelper = new LiquidityHelper(this.chainId, this.signer, addLiquidityDTO);
		const transaction = await addLiquidityHelper.buildAddLiquidityTransaction();
		const txRes = await this.signer.sendTransaction(transaction);
		console.log({ txRes });
		return { txRes };
	}

	async withdrawLiquidity(withdrawLiquidityDTO: LiquidityDTO): Promise<WithdrawLiquidityResult> {
		if (typeof envs.POSITION_INDEX !== 'number') {
			throw new Error('Position index should be provided');
		}
		const tokenId: BigintIsh = await this.nfpmContract.tokenOfOwnerByIndex(this.signer.address, envs.POSITION_INDEX);
		const { liquidity } = await this.nfpmContract.positions(tokenId);

		const deadline = Math.floor(Date.now() / ONE_THOUSAND) + SECONDS_IN_HOUR;

		const txRes = await (this.nfpmContract.connect(this.signer) as Contract).decreaseLiquidity({
			tokenId,
			liquidity,
			amount0Min: 0,
			amount1Min: 0,
			deadline
		});

		console.log({ txRes });
		return { txRes };
	}

	async positions(): Promise<PositionInfo[]> {
		const { address } = this.signer;
		console.log(`Signer address: ${address}`);
		const positionsTotal = await this.nfpmContract.balanceOf(address);
		console.log({ positionsTotal });
		const pendingPositions = Array.from({ length: Number(positionsTotal) }).map(
			async (_, i) => await this.nfpmContract.tokenOfOwnerByIndex(address, i)
		);
		const tokenIds = await Promise.all(pendingPositions);
		console.log(tokenIds);
		const pendingPositionsData = tokenIds.map(async (tokenId: BigintIsh) => await this.nfpmContract.positions(tokenId));
		const positionsRawData = await Promise.all(pendingPositionsData);

		const pendingPositionsWithTWAP = positionsRawData.map(
			async (position: Record<string, unknown>) => await this.formatPositionWithTWAP(position)
		);

		return await Promise.all(pendingPositionsWithTWAP);
	}

	private async formatPositionWithTWAP(position: Record<string, unknown>): Promise<PositionInfo> {
		const { TWAP, current } = await this.getPrices(position);
		return {
			tickLower: position.tickLower as number,
			tickUpper: position.tickUpper as number,
			liquidity: position.liquidity as JSBI,
			feeGrowthInside0LastX128: position.feeGrowthInside0LastX128 as JSBI,
			feeGrowthInside1LastX128: position.feeGrowthInside1LastX128 as JSBI,
			tokensOwed0: position.tokensOwed0 as JSBI,
			tokensOwed1: position.tokensOwed1 as JSBI,
			TWAP,
			currentPrice: current,
			priceRange: this.getPriceRange(position)
		};
	}

	private getPriceRange(position: Record<string, unknown>): string[] {
		return [
			getPriceFromTick(JSBI.BigInt(Number(position.tickLower))),
			getPriceFromTick(JSBI.BigInt(Number(position.tickUpper)))
		];
	}

	private async getPrices(position: Record<string, unknown>): Promise<PoolPrices> {
		const erc20A = new Contract(position.token0 as string, ERC20_ABI, this.provider);
		const erc20B = new Contract(position.token1 as string, ERC20_ABI, this.provider);

		const [decimalsA, decimalsB] = await Promise.all([erc20A.decimals(), erc20B.decimals()]);

		const tokenA: Token = new Token(Number(this.chainId), position.token0 as string, Number(decimalsA));
		const tokenB: Token = new Token(Number(this.chainId), position.token1 as string, Number(decimalsB));
		const poolFee: FeeAmount = position.fee as FeeAmount;
		const addLiquidityHelper = new LiquidityHelper(
			this.chainId,
			this.signer,
			new LiquidityDTO(tokenA, tokenB, '0', '0', poolFee)
		);
		return {
			TWAP: await addLiquidityHelper.getTWAP(),
			current: await addLiquidityHelper.getCurrentPrice()
		};
	}
}
