import { V3AMM } from "../../v3AMM";
import { AddLiquidityResult, PositionInfo, WithdrawLiquidityResult } from "../datatypes";
import { AddLiquidityDTO, WithdrawLiquidityDTO } from "../dtos";
import { ethers, JsonRpcProvider, Wallet } from "ethers";
import { envs } from "../config/env";
import INONFUNGIBLE_POSITION_MANAGER from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { Contract } from "web3";
import { CHAIN_CONFIGS } from "../../chains";
import { BigintIsh } from "@uniswap/sdk-core";

export class V3AMMimpl implements V3AMM {
    private signer: Wallet;
    //@ts-ignore
    private nfpmContract: Contract;

    constructor(chainId: string, userPrivateKey: string) {
        const provider = new JsonRpcProvider(envs.PROVIDER_RPC);
        this.signer = new Wallet(userPrivateKey, provider);

        this.nfpmContract = new ethers.Contract(
            CHAIN_CONFIGS[chainId].NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
            INONFUNGIBLE_POSITION_MANAGER.abi,
            provider
        );
    }

    async addLiquidity(addLiquidityDTO: AddLiquidityDTO): Promise<AddLiquidityResult> {
        return {};
    }
    async withdrawLiquidity(withdrawLiquidityDTO: WithdrawLiquidityDTO): Promise<WithdrawLiquidityResult> {
        return {};
    }

    async positions(): Promise<PositionInfo[]> {
        const { address } = this.signer;
        const positionsTotal = await this.nfpmContract.balanceOf(address);
        const pendingPositions = Array.from({ length: Number(positionsTotal) })
            .map((_, i) => this.nfpmContract.tokenOfOwnerByIndex(address, i));
        const tokenIds = await Promise.all(pendingPositions);
        const pendingPositionsData = tokenIds.map((tokenId: BigintIsh) => this.nfpmContract.positions(tokenId));
        const positionsRawData = await Promise.all(pendingPositionsData);

        return positionsRawData.map((position: Record<string, unknown>) => ({
            tickLower: position.tickLower,
            tickUpper: position.tickUpper,
            liquidity: position.liquidity,
            feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
            feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
            tokensOwed0: position.tokensOwed0,
            tokensOwed1: position.tokensOwed1
        }));
    }
}