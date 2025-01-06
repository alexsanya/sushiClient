import { type V3AMM } from '../../v3AMM';
import { type AddLiquidityResult, type PositionInfo, type WithdrawLiquidityResult } from '../datatypes';
import { LiquidityDTO } from '../dtos';
import { Contract, ethers, JsonRpcProvider, TransactionReceipt, TransactionRequest, Wallet } from 'ethers';
import { envs } from '../config/env';
import INONFUNGIBLE_POSITION_MANAGER from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { CHAIN_CONFIGS } from '../../chains';
import { type BigintIsh, CurrencyAmount, Token } from '@uniswap/sdk-core';
import { LiquidityHelper } from './LiquidityHelper';
import { CollectOptions, MethodParameters, NonfungiblePositionManager, type FeeAmount } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import { ERC20_ABI } from '../../abis/erc20';
import {
	MAX_FEE_PER_GAS,
	MAX_PRIORITY_FEE_PER_GAS,
	ONE_THOUSAND,
	RANGE_COEFFICIENT,
	RANGE_COEFFICIENT_NEW,
	SECONDS_IN_HOUR
} from '../constants';
import { getPriceFromTick } from '../utils';
import { type ReallocateLiquidityResult } from '../datatypes/reallocateLiquidityResult.datatype';
import { call } from 'web3/lib/commonjs/eth.exports';

interface PoolPrices {
	TWAP: string;
	current: string;
}

export class V3AMMimpl implements V3AMM {
	private readonly chainId: string;
	private readonly signer: Wallet;
	private readonly provider: JsonRpcProvider;
	private readonly nfpmContract: Contract;
	private readonly nonfungiblePositionManagerAddress: string;

	constructor(chainId: string, userPrivateKey: string) {
		this.chainId = chainId;
		this.provider = new JsonRpcProvider(envs.PROVIDER_RPC as string);
		this.signer = new Wallet(userPrivateKey, this.provider);
		this.nonfungiblePositionManagerAddress = CHAIN_CONFIGS[chainId].NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS;

		this.nfpmContract = new ethers.Contract(
			CHAIN_CONFIGS[chainId].NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
			INONFUNGIBLE_POSITION_MANAGER.abi,
			this.provider
		);
	}

	async addLiquidity(addLiquidityDTO: LiquidityDTO): Promise<AddLiquidityResult> {
		const addLiquidityHelper = new LiquidityHelper(this.chainId, this.signer, addLiquidityDTO);
		const transaction = await addLiquidityHelper.buildAddLiquidityTransaction(addLiquidityDTO.rangeCoefficient);
		const txRes = await this.signer.sendTransaction(transaction);
		console.log({ txRes });
		return { txRes };
	}

	private async getWithdrawLiquidityCalldata(tokenId: BigintIsh): Promise<string> {
		if (typeof envs.POSITION_INDEX !== 'number') {
			throw new Error('Position index should be provided');
		}
		const { liquidity } = await this.nfpmContract.positions(tokenId);

		const deadline = Math.floor(Date.now() / ONE_THOUSAND) + SECONDS_IN_HOUR;

		const params = {
			tokenId,
			liquidity,
			amount0Min: 0,
			amount1Min: 0,
			deadline
		};
		return this.nfpmContract.interface.encodeFunctionData('decreaseLiquidity', [params]);
	}

	async withdrawLiquidity(): Promise<WithdrawLiquidityResult> {
		const tokenId: BigintIsh = await this.nfpmContract.tokenOfOwnerByIndex(this.signer.address, envs.POSITION_INDEX);
		const calldata = await this.getWithdrawLiquidityCalldata(tokenId);
		const transaction = {
			data: calldata,
			to: this.nonfungiblePositionManagerAddress,
			value: 0,
			from: this.signer.address,
			maxFeePerGas: MAX_FEE_PER_GAS,
			maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS
		};

		const txRes = await this.signer.sendTransaction(transaction);
		console.log({ txRes });
		return { txRes };
	}

	async getCollectAllFeesTransaction(tokenId: BigintIsh): Promise<TransactionRequest> {
		const position = await this.nfpmContract.positions(tokenId);
		const [token0, token1] = await this.getTokensByAddresses(position.token0 as string, position.token1 as string);
		const collectOptions: CollectOptions = {
			tokenId,
			expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(
			  token0,
			  JSBI.BigInt(position.tokensOwed0.toString())
			),
			expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(
			  token1,
			  JSBI.BigInt(position.tokensOwed1.toString())
			),
			recipient: this.signer.address
		}
		const { calldata, value } = NonfungiblePositionManager.collectCallParameters(collectOptions);
		const transaction = {
			data: calldata,
			to: this.nonfungiblePositionManagerAddress,
			value: value,
			from: this.signer.address,
			maxFeePerGas: MAX_FEE_PER_GAS,
			maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
		}

		return transaction;
	}

	async collectAllFees(tokenId: BigintIsh) {
		const transaction = await this.getCollectAllFeesTransaction(tokenId);
		const txRes = await this.signer.sendTransaction(transaction);
		console.log({ txRes });
		return { txRes };
	}

	async reallocate(addLiquidityDTO: LiquidityDTO): Promise<ReallocateLiquidityResult> {
		const addLiquidityHelper = new LiquidityHelper(this.chainId, this.signer, addLiquidityDTO);
		const { data: addLiquidityCalldata } = await addLiquidityHelper.buildAddLiquidityTransaction(RANGE_COEFFICIENT_NEW);
		const tokenId: BigintIsh = await this.nfpmContract.tokenOfOwnerByIndex(this.signer.address, envs.POSITION_INDEX);
		const withdrawLiquidityCalldata = await this.getWithdrawLiquidityCalldata(tokenId);
		const { data: collectAllFeesCalldata } = await this.getCollectAllFeesTransaction(tokenId);
		const erc20A = new Contract(addLiquidityDTO.tokenA.address, ERC20_ABI, this.signer);
		const erc20B = new Contract(addLiquidityDTO.tokenB.address, ERC20_ABI, this.signer);
		const txApproveA = await erc20A.approve(this.nonfungiblePositionManagerAddress, addLiquidityDTO.amountA);
		await txApproveA.wait();
		const txApproveB = await erc20B.approve(this.nonfungiblePositionManagerAddress, addLiquidityDTO.amountB);

		await txApproveB.wait();

		const txRes = await (this.nfpmContract.connect(this.signer) as Contract).multicall([
			withdrawLiquidityCalldata,
			collectAllFeesCalldata,
			addLiquidityCalldata
		]);
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
			async (position: Record<string, unknown>, i: number) => await this.formatPositionWithTWAP(tokenIds[i], position)
		);

		return await Promise.all(pendingPositionsWithTWAP);
	}

	private async formatPositionWithTWAP(tokenId: JSBI, position: Record<string, unknown>): Promise<PositionInfo> {
		const { TWAP, current } = await this.getPrices(position);
		return {
			tokenId,
			tickLower: position.tickLower as number,
			tickUpper: position.tickUpper as number,
			liquidity: position.liquidity as JSBI,
			token0: position.token0 as string,
			token1: position.token1 as string,
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

	private async getTokensByAddresses(tokenA: string, tokenB: string): Promise<Array<Token>> {

		const erc20A = new Contract(tokenA as string, ERC20_ABI, this.provider);
		const erc20B = new Contract(tokenB as string, ERC20_ABI, this.provider);

		const [decimalsA, decimalsB] = await Promise.all([erc20A.decimals(), erc20B.decimals()]);

		return [
			new Token(Number(this.chainId), tokenA as string, Number(decimalsA)),
			new Token(Number(this.chainId), tokenB as string, Number(decimalsB))
		]
	}

	private async getPrices(position: Record<string, unknown>): Promise<PoolPrices> {
		const { token0, token1 } = position;
		const [tokenA, tokenB] = await this.getTokensByAddresses(token0 as string, token1 as string);
		const poolFee: FeeAmount = position.fee as FeeAmount;
		const addLiquidityHelper = new LiquidityHelper(
			this.chainId,
			this.signer,
			new LiquidityDTO(tokenA, tokenB, '0', '0', poolFee, RANGE_COEFFICIENT)
		);
		return {
			TWAP: await addLiquidityHelper.getTWAP(),
			current: await addLiquidityHelper.getCurrentPrice()
		};
	}
}
