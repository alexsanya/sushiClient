import { Token } from "@uniswap/sdk-core";
import { CHAIN_ID } from "../chains/sepolia";
import { envs } from "./config/env";
import { LiquidityDTO } from "./dtos";
import { V3AMMimpl } from "./infrastructure/v3AMM.impl";
import { setUpFork } from "./operations/setUpFork";
import { CHAIN_CONFIGS } from "../chains";
import { FeeAmount } from "@uniswap/v3-sdk";

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

(async function main() {
    if (!envs.USER_PRIVATE_KEY) {
        throw new Error("Private key not provided");
    }
    if (!envs.PROVIDER_RPC) {
        throw new Error("Provider rpc is not defined");
    }

    switch (envs.COMMAND) {
        case 'positions':
            console.log('Active positions:');
            await options();
            break;
        case 'addLiquidity':
            console.log('Adding liquidity: ');
            await addLiquidity();
            break;
        case 'withdrawLiquidity':
            console.log('Withdrawing liquidity: ');
            await withdrawLiquidity();
            break;
        case 'setUp':
            console.log('Preparing chain fork: ');
            await setUpFork((envs as Record<string, string>).CHAIN_ID);
            console.log('Chain state is ready');
            break;
        default:
            console.log(`unknown command ${envs.COMMAND}`);
    }

})()

async function options() {
    const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
    const positions = await v3Amm.positions();
    console.log(positions);
}

async function addLiquidity() {
    const chainId = (envs as Record<string, string>).CHAIN_ID;
    const {
        CHAIN_ID,
        POOL_FEE,
        TOKEN_A_ADDRESS,
        TOKEN_B_ADDRESS,
        AMOUNT_A,
        AMOUNT_B,
        TOKEN_A_DECIMALS,
        TOKEN_B_DECIMALS
    } = CHAIN_CONFIGS[chainId];
    const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
    const tokenA: Token = new Token(Number(CHAIN_ID), TOKEN_A_ADDRESS, TOKEN_A_DECIMALS);
    const tokenB: Token = new Token(Number(CHAIN_ID), TOKEN_B_ADDRESS, TOKEN_B_DECIMALS);
    const poolFee: FeeAmount = POOL_FEE;
    const result = await v3Amm.addLiquidity(new LiquidityDTO(
        tokenA,
        tokenB,
        AMOUNT_A,
        AMOUNT_B,
        poolFee
    ));
}

async function withdrawLiquidity() {
    const chainId = (envs as Record<string, string>).CHAIN_ID;
    const {
        CHAIN_ID,
        POOL_FEE,
        TOKEN_A_ADDRESS,
        TOKEN_B_ADDRESS,
        AMOUNT_A,
        AMOUNT_B,
        TOKEN_A_DECIMALS,
        TOKEN_B_DECIMALS
    } = CHAIN_CONFIGS[chainId];
    const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
    const tokenA: Token = new Token(Number(CHAIN_ID), TOKEN_A_ADDRESS, TOKEN_A_DECIMALS);
    const tokenB: Token = new Token(Number(CHAIN_ID), TOKEN_B_ADDRESS, TOKEN_B_DECIMALS);
    const poolFee: FeeAmount = POOL_FEE;
    const result = await v3Amm.withdrawLiquidity(new LiquidityDTO(
        tokenA,
        tokenB,
        AMOUNT_A,
        AMOUNT_B,
        poolFee
    ));
}