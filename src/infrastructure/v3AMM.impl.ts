import { V3AMM } from "../../v3AMM";
import { AddLiquidityResult, PositionInfo, WithdrawLiquidityResult } from "../datatypes";
import { LiquidityDTO } from "../dtos";
import { ethers, JsonRpcProvider, Wallet } from "ethers";
import { envs } from "../config/env";
import INONFUNGIBLE_POSITION_MANAGER from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { Contract } from "web3";
import { CHAIN_CONFIGS } from "../../chains";
import { BigintIsh, Percent } from "@uniswap/sdk-core";
import { LiquidityHelper } from "./LiquidityHelper";

export class V3AMMimpl implements V3AMM {
    private chainId: string;
    private signer: Wallet;
    private provider: JsonRpcProvider;
    //@ts-ignore
    private nfpmContract: Contract;

    constructor(chainId: string, userPrivateKey: string) {
        this.chainId = chainId;
        this.provider = new JsonRpcProvider(envs.PROVIDER_RPC);
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
        return {};
    }

    async withdrawLiquidity(withdrawLiquidityDTO: LiquidityDTO): Promise<WithdrawLiquidityResult> {
        const addLiquidityHelper = new LiquidityHelper(this.chainId, this.signer, withdrawLiquidityDTO);
        const tokenId = await this.nfpmContract.tokenOfOwnerByIndex(this.signer.address, 0);
        const transaction = await addLiquidityHelper.buildWithdrawLiquidityTransaction(tokenId, new Percent(1));
        const txRes = await this.signer.sendTransaction(transaction);
        console.log({ txRes });
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