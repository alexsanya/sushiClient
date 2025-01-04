import { CollectOptions, computePoolAddress, FeeAmount, MintOptions, nearestUsableTick, NonfungiblePositionManager, RemoveLiquidityOptions } from '@uniswap/v3-sdk'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import INONFUNGIBLE_POSITION_MANAGER from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
import { Token, BigintIsh, Percent, CurrencyAmount } from '@uniswap/sdk-core'
import { Pool, Position } from '@uniswap/v3-sdk'
import { Contract, ethers, JsonRpcProvider, Provider, TransactionRequest, Wallet } from 'ethers';
import { CHAIN_ID, NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, POOL_FACTORY_CONTRACT_ADDRESS, POOL_FEE, TOKEN_A_ADDRESS, TOKEN_A_DECIMALS, TOKEN_A_MINTER_ADDRESS, TOKEN_B_ADDRESS, TOKEN_B_DECIMALS, TOKEN_B_MINTER_ADDRESS } from './chains/sepolia';
import { ERC20_ABI } from './abis/erc20';
import JSBI from 'jsbi';
import { V3AMMimpl } from './src/infrastructure/v3AMM.impl';
import { envs } from './src/config/env';


const tokenA: Token = new Token(Number(CHAIN_ID), TOKEN_A_ADDRESS, TOKEN_A_DECIMALS);
const tokenB: Token = new Token(Number(CHAIN_ID), TOKEN_B_ADDRESS, TOKEN_B_DECIMALS);
const poolFee: FeeAmount = POOL_FEE;

const USER_PRIVATE_KEY: string = process.env['USER_PRIVATE_KEY'] as string;

const MAX_FEE_PER_GAS = 250000000000;
const MAX_PRIORITY_FEE_PER_GAS = 250000000000;


const amountA: BigintIsh = "9990000000000";
const amountB: BigintIsh = "10500090000000000000000000";

interface PositionInfo {
    tickLower: number
    tickUpper: number
    liquidity: JSBI
    feeGrowthInside0LastX128: JSBI
    feeGrowthInside1LastX128: JSBI
    tokensOwed0: JSBI
    tokensOwed1: JSBI
}

function getPoolContract(provider: Provider): Contract {
    const currentPoolAddress = computePoolAddress({
        factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
        tokenA,
        tokenB,
        fee: poolFee,
    });
    return new ethers.Contract(
        currentPoolAddress,
        IUniswapV3PoolABI.abi,
        provider
    );
}

async function getConfiguredPool(poolContract: Contract): Promise<Pool> {
    const [liquidity, slot0] =
        await Promise.all([
          poolContract.liquidity(),
          poolContract.slot0(),
        ]);

    console.debug({ liquidity, slot0 });

    return new Pool(
        tokenA,
        tokenB,
        poolFee,
        slot0.sqrtPriceX96.toString(),
        liquidity.toString(),
        Number(slot0.tick)
    );
}

function getPosition(configuredPool: Pool, amountA: BigintIsh, amountB: BigintIsh): Position {
    return Position.fromAmounts({
        pool: configuredPool,
        tickLower:
          nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) -
          configuredPool.tickSpacing * 2,
        tickUpper:
          nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) +
          configuredPool.tickSpacing * 2,
        amount0: amountA,
        amount1: amountB,
        useFullPrecision: true,
    })
}

function getMintOptions(recipient: string): MintOptions {
    return {
        recipient,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
    }
}

async function supplyAndApproveTokens(provider: JsonRpcProvider, user: Wallet, amountA: BigintIsh, amountB: BigintIsh): Promise<void> {

    // Impersonate the token minter
    await provider.send('anvil_impersonateAccount', [TOKEN_A_MINTER_ADDRESS]);
    if (TOKEN_A_ADDRESS !== TOKEN_B_ADDRESS) {
        await provider.send('anvil_impersonateAccount', [TOKEN_B_MINTER_ADDRESS]);
    }

    // Get the token holder signer
    const minterA = await provider.getSigner(TOKEN_A_MINTER_ADDRESS);
    const minterB = await provider.getSigner(TOKEN_B_MINTER_ADDRESS);

    // Connect signed with the contract
    const erc20Acontract = new Contract(TOKEN_A_ADDRESS, ERC20_ABI, minterA);
    const erc20Bcontract = new Contract(TOKEN_B_ADDRESS, ERC20_ABI, minterB);
    const [balanceAbefore, balanceBbefore] = await Promise.all([
        erc20Acontract.balanceOf(user.address),
        erc20Bcontract.balanceOf(user.address)
    ]);
    // mint and transfer
    const [mintAtx, mintBtx] = await Promise.all([
        erc20Acontract.mint(amountA),
        erc20Bcontract.mint(amountB)
    ]);
    await Promise.all([ mintAtx.wait(), mintBtx.wait() ]);
    const [txTransferA, txTransferB] = await Promise.all([
        erc20Acontract.transfer(user.address, amountA),
        erc20Bcontract.transfer(user.address, amountB)
    ]);
    await Promise.all([ txTransferA.wait(), txTransferB.wait() ]);

    const [balanceAafter, balanceBafter] = await Promise.all([
        erc20Acontract.balanceOf(user.address),
        erc20Bcontract.balanceOf(user.address)
    ]);
    console.debug({ balanceAbefore, balanceAafter });
    console.debug({ balanceBbefore, balanceBafter });

    //approvals
    const txApproveA = await (erc20Acontract.connect(user) as Contract).approve(NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, balanceAafter);
    await txApproveA.wait();
    const txApproveB = await (erc20Bcontract.connect(user) as Contract).approve(NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS, balanceBafter);
    await txApproveB.wait();
}

function buildMintTransaction(from: string, position: Position): TransactionRequest {
    const { calldata, value } = NonfungiblePositionManager.addCallParameters(
        position,
        getMintOptions(from)
    )
    console.debug({ calldata, value });
    return {
        data: calldata,
        to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        value: value,
        from,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
    }
}

async function mintPosition(pool: Pool, user: Wallet, amountA: BigintIsh, amountB: BigintIsh): Promise<void> {
    const position = getPosition(pool, amountA, amountB);
    const transaction = buildMintTransaction(user.address, position);

    const txRes = await user.sendTransaction(transaction);
    console.log({ txRes });
}

async function getPositionInfo(nfpmContract: Contract, tokenId: BigintIsh): Promise<PositionInfo> {
    const position = await nfpmContract.positions(tokenId);
    return {
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        liquidity: position.liquidity,
        feeGrowthInside0LastX128: position.feeGrowthInside0LastX128,
        feeGrowthInside1LastX128: position.feeGrowthInside1LastX128,
        tokensOwed0: position.tokensOwed0,
        tokensOwed1: position.tokensOwed1
    }
}

async function withdrawLiquidity(pool: Pool, tokenId: BigintIsh, liquidityPercentage: Percent, user: Wallet) {
    const currentPosition = getPosition(pool, amountA, amountB);
    const collectOptions: Omit<CollectOptions, 'tokenId'> = {
        expectedCurrencyOwed0: CurrencyAmount.fromRawAmount(
          tokenA,
          0
        ),
        expectedCurrencyOwed1: CurrencyAmount.fromRawAmount(
          tokenB,
          0
        ),
        recipient: user.address
    }
    const removeLiquidityOptions: RemoveLiquidityOptions = {
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
        tokenId: JSBI.BigInt(tokenId.toString()),
        // percentage of liquidity to remove
        liquidityPercentage,
        collectOptions,
    }
    const { calldata, value } = NonfungiblePositionManager.removeCallParameters(
        currentPosition,
        removeLiquidityOptions
    )
    const transaction = {
        data: calldata,
        to: NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        value: value,
        from: user.address,
        maxFeePerGas: MAX_FEE_PER_GAS,
        maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
      }
      
      const txRes = await user.sendTransaction(transaction)

      console.log(txRes);
}

async function mainLegacy(operation: string) {
    const provider = new JsonRpcProvider(process.env['PROVIDER_RPC']);
    const user = new Wallet(USER_PRIVATE_KEY, provider);
    console.log(`User's wallet address: ${user.address}`);
    const nfpmContract = new ethers.Contract(
        NONFUNGIBLE_POSITION_MANAGER_CONTRACT_ADDRESS,
        INONFUNGIBLE_POSITION_MANAGER.abi,
        provider
    );
    const numPositionsBefore = await nfpmContract.balanceOf(user.address)
    const poolContract = getPoolContract(provider); 
    const configuredPool = await getConfiguredPool(poolContract);
    if (operation === 'add') {
        await supplyAndApproveTokens(provider, user, amountA, amountB);
        await mintPosition(configuredPool, user, amountA, amountB);
        const tokenId = await nfpmContract.tokenOfOwnerByIndex(user.address, 0);
        const positionInfo = await getPositionInfo(nfpmContract, tokenId);
        console.log(positionInfo);
    } else {
        const tokenId = await nfpmContract.tokenOfOwnerByIndex(user.address, 0);
        console.debug({tokenId});
        await withdrawLiquidity(configuredPool, tokenId, new Percent(1), user);
    }
    const numPositionsAfter = await nfpmContract.balanceOf(user.address)
    console.log({ numPositionsBefore, numPositionsAfter });
}

(async function main() {
    if (!envs.USER_PRIVATE_KEY) {
        throw new Error("Private key not found");
    }
    const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY);
    const positions = v3Amm.positions();
    console.log(positions);

})()