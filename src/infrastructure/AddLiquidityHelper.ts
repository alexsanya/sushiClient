import { computePoolAddress, FeeAmount, MintOptions, nearestUsableTick, NonfungiblePositionManager, Pool, Position } from "@uniswap/v3-sdk";
import { CHAIN_CONFIGS } from "../../chains";
import { ethers, JsonRpcProvider, TransactionRequest, Wallet } from "ethers";
import { envs } from "../config/env";
import { AddLiquidityDTO } from "../dtos";
import { BigintIsh, Percent, Token } from "@uniswap/sdk-core";
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';

const MAX_FEE_PER_GAS = 250000000000;
const MAX_PRIORITY_FEE_PER_GAS = 250000000000;

export class AddLiquidityHelper {
    private user: Wallet;
    private tokenA: Token;
    private tokenB: Token;
    private amountA: BigintIsh;
    private amountB: BigintIsh;
    private poolFee: FeeAmount;
    private provider: JsonRpcProvider;
    private poolFactoryContractAddress: string;
    private nonfungiblePositionManagerAddress: string;

    constructor(chainId: string, user: Wallet, addLiquidityDTO: AddLiquidityDTO) {
        this.user = user;
        this.tokenA = addLiquidityDTO.tokenA;
        this.tokenB = addLiquidityDTO.tokenB;
        this.amountA = addLiquidityDTO.amountA;
        this.amountB = addLiquidityDTO.amountB;
        this.poolFee = addLiquidityDTO.poolFee;
        this.provider = new JsonRpcProvider(envs.PROVIDER_RPC);
        this.poolFactoryContractAddress = CHAIN_CONFIGS[chainId].POOL_FACTORY_CONTRACT_ADDRESS;
        this.nonfungiblePositionManagerAddress = CHAIN_CONFIGS[chainId].NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS;
    }

    async buildAddLiquidityTransaction(): Promise<TransactionRequest> {
        const poolContract = this.getPoolContract(); 
        const pool = await this.getConfiguredPool(poolContract);
        
        const position = this.getPosition(pool);
        const transaction = this.buildMintTransaction(this.user.address, position);
        return transaction;
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