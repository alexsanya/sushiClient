import { CollectOptions, computePoolAddress, FeeAmount, MintOptions, nearestUsableTick, NonfungiblePositionManager, Pool, Position, RemoveLiquidityOptions, tickToPrice } from "@uniswap/v3-sdk";
import { CHAIN_CONFIGS } from "../../chains";
import { ethers, JsonRpcProvider, TransactionRequest, Wallet } from "ethers";
import { envs } from "../config/env";
import { LiquidityDTO } from "../dtos";
import { BigintIsh, CurrencyAmount, Percent, Price, Token } from "@uniswap/sdk-core";
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import JSBI from "jsbi";

const MAX_FEE_PER_GAS = 250000000000;
const MAX_PRIORITY_FEE_PER_GAS = 250000000000;

export class LiquidityHelper {
    private user: Wallet;
    private tokenA: Token;
    private tokenB: Token;
    private amountA: BigintIsh;
    private amountB: BigintIsh;
    private poolFee: FeeAmount;
    private provider: JsonRpcProvider;
    private poolFactoryContractAddress: string;
    private nonfungiblePositionManagerAddress: string;

    constructor(chainId: string, user: Wallet, liquidityDTO: LiquidityDTO) {
        this.user = user;
        this.tokenA = liquidityDTO.tokenA;
        this.tokenB = liquidityDTO.tokenB;
        this.amountA = liquidityDTO.amountA;
        this.amountB = liquidityDTO.amountB;
        this.poolFee = liquidityDTO.poolFee;
        this.provider = new JsonRpcProvider(envs.PROVIDER_RPC);
        this.poolFactoryContractAddress = CHAIN_CONFIGS[chainId].POOL_FACTORY_CONTRACT_ADDRESS;
        this.nonfungiblePositionManagerAddress = CHAIN_CONFIGS[chainId].NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS;
    }

    async getTWAP(): Promise<Price<Token, Token>> {
        const poolContract = this.getPoolContract(); 
        const secondsBetween = BigInt(10);
        const observations = await poolContract.observe([secondsBetween, 0]);
        const diffTickCumulative = observations[0][0] - observations[0][1];
        const averageTick = BigInt(diffTickCumulative) / secondsBetween;
        return tickToPrice(this.tokenA, this.tokenB, Number(averageTick));
    }

    async buildAddLiquidityTransaction(): Promise<TransactionRequest> {
        const poolContract = this.getPoolContract(); 
        const pool = await this.getConfiguredPool(poolContract);
        
        const position = this.getPosition(pool);
        const transaction = this.buildMintTransaction(this.user.address, position);
        return transaction;
    }
    async buildWithdrawLiquidityTransaction(tokenId: BigintIsh, liquidityPercentage: Percent): Promise<TransactionRequest> {
        const poolContract = this.getPoolContract(); 
        const pool = await this.getConfiguredPool(poolContract);
        const currentPosition = this.getPosition(pool);
        const collectOptions: Omit<CollectOptions, 'tokenId'> = {
            expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(
            this.tokenA,
            0
            ),
            expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(
            this.tokenB,
            0
            ),
            recipient: this.user.address
        }
        const removeLiquidityOptions: RemoveLiquidityOptions = {
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            slippageTolerance: new Percent(50, 10_000),
            tokenId: JSBI.BigInt(tokenId.toString()),
            // percentage of liquidity to remove
            liquidityPercentage,
            collectOptions,
        }

        return this.buildWithdrawTransaction(currentPosition, removeLiquidityOptions);
    }

    private getPosition(configuredPool: Pool): Position {
        return Position.fromAmounts({
            pool: configuredPool,
            tickLower:
            nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) -
            configuredPool.tickSpacing * 2,
            tickUpper:
            nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) +
            configuredPool.tickSpacing * 2,
            amount0: this.amountA,
            amount1: this.amountB,
            useFullPrecision: true,
        })
    }

    private getMintOptions(recipient: string): MintOptions {
        return {
            recipient,
            deadline: Math.floor(Date.now() / 1000) + 60 * 20,
            slippageTolerance: new Percent(50, 10_000),
        }
    }

    private buildMintTransaction(from: string, position: Position): TransactionRequest {
        const { calldata, value } = NonfungiblePositionManager.addCallParameters(
            position,
            this.getMintOptions(from)
        )
        console.debug({ calldata, value });
        return {
            data: calldata,
            to: this.nonfungiblePositionManagerAddress,
            value: value,
            from,
            maxFeePerGas: MAX_FEE_PER_GAS,
            maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
        }
    }

    private buildWithdrawTransaction(currentPosition: Position, removeLiquidityOptions: RemoveLiquidityOptions): TransactionRequest {
        const { calldata, value } = NonfungiblePositionManager.removeCallParameters(
            currentPosition,
            removeLiquidityOptions
        )
        return {
            data: calldata,
            to: this.nonfungiblePositionManagerAddress,
            value: value,
            from: this.user.address,
            maxFeePerGas: MAX_FEE_PER_GAS,
            maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
        }
    }

    private getPoolContract(): Contract {
        const currentPoolAddress = computePoolAddress({
            factoryAddress: this.poolFactoryContractAddress,
            tokenA: this.tokenA,
            tokenB: this.tokenB,
            fee: this.poolFee,
        });
        return new ethers.Contract(
            currentPoolAddress,
            IUniswapV3PoolABI.abi,
            this.provider
        );
    }

    private async getConfiguredPool(poolContract: Contract): Promise<Pool> {
        const [liquidity, slot0] =
            await Promise.all([
                poolContract.liquidity(),
                poolContract.slot0(),
            ]);

            console.debug({ liquidity, slot0 });

            return new Pool(
                this.tokenA,
                this.tokenB,
                this.poolFee,
                slot0.sqrtPriceX96.toString(),
                liquidity.toString(),
                Number(slot0.tick)
            );
    }
}