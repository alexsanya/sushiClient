import { V3AMM } from "../../v3AMM";
import { AddLiquidityResult, PositionInfo, WithdrawLiquidityResult } from "../datatypes";
import { LiquidityDTO } from "../dtos";
import { Contract, ethers, JsonRpcProvider, Wallet } from "ethers";
import { envs } from "../config/env";
import INONFUNGIBLE_POSITION_MANAGER from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { CHAIN_CONFIGS } from "../../chains";
import { BigintIsh, Percent, Token } from "@uniswap/sdk-core";
import { LiquidityHelper } from "./LiquidityHelper";
import { FeeAmount } from "@uniswap/v3-sdk";
import JSBI from "jsbi";
import { ERC20_ABI } from "../../abis/erc20";

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
        console.log(`Signer address: ${address}`);
        const positionsTotal = await this.nfpmContract.balanceOf(address);
        console.log({positionsTotal});
        const pendingPositions = Array.from({ length: Number(positionsTotal) })
            .map((_, i) => this.nfpmContract.tokenOfOwnerByIndex(address, i));
        const tokenIds = await Promise.all(pendingPositions);
        console.log(tokenIds);
        const pendingPositionsData = tokenIds.map((tokenId: BigintIsh) => this.nfpmContract.positions(tokenId));
        const positionsRawData = await Promise.all(pendingPositionsData);

        const pendingPositionsWithTWAP = positionsRawData.map((position: Record<string, unknown>) => this.formatPositionWithTWAP(position));

        return await Promise.all(pendingPositionsWithTWAP);
    }

    private async formatPositionWithTWAP(position: Record<string, unknown>): Promise<PositionInfo> {
        return {
            tickLower: position.tickLower as number,
            tickUpper: position.tickUpper as number,
            liquidity: position.liquidity as JSBI,
            feeGrowthInside0LastX128: position.feeGrowthInside0LastX128 as JSBI,
            feeGrowthInside1LastX128: position.feeGrowthInside1LastX128 as JSBI,
            tokensOwed0: position.tokensOwed0 as JSBI,
            tokensOwed1: position.tokensOwed1 as JSBI,
            TWAP: await this.getTWAP(position)
        }
    }

    private async getTWAP(position: Record<string, unknown>): Promise<string> {

        const erc20A = new Contract(position.token0 as string, ERC20_ABI, this.provider);
        const erc20B = new Contract(position.token1 as string, ERC20_ABI, this.provider);

        const [decimalsA, decimalsB] = await Promise.all([
            erc20A.decimals(),
            erc20B.decimals()
        ]);

        const tokenA: Token = new Token(Number(this.chainId), position.token0 as string, Number(decimalsA));
        const tokenB: Token = new Token(Number(this.chainId), position.token1 as string, Number(decimalsB));
        const poolFee: FeeAmount = position.fee;
        const addLiquidityHelper = new LiquidityHelper(this.chainId, this.signer, new LiquidityDTO(tokenA, tokenB, "0", "0", poolFee));
        const result = await addLiquidityHelper.getTWAP();
        return result.toFixed()

    }
}