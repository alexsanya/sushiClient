import { computePoolAddress, FeeAmount, MintOptions, nearestUsableTick, NonfungiblePositionManager } from '@uniswap/v3-sdk'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import { Token, BigintIsh, Percent } from '@uniswap/sdk-core'
import { Pool, Position } from '@uniswap/v3-sdk'
import { ethers, JsonRpcProvider } from 'ethers';

const SEPOLIA_ID = 11155111;
const POOL_FACTORY_CONTRACT_ADDRESS: string = "0x1f2FCf1d036b375b384012e61D3AA33F8C256bbE";
const USDC_ADDRESS = "0x1a6922a04b14b1560875d77a8c02ab3c0e354020";
const DAI_ADDRESS = "0x59e3a6011631de8e5302e5138d7eb3006e607b75";

const token0: Token = new Token(SEPOLIA_ID, USDC_ADDRESS, 6);
const token1: Token = new Token(SEPOLIA_ID, DAI_ADDRESS, 6);
const poolFee: FeeAmount = 500;

(async function main() {
    const currentPoolAddress = computePoolAddress({
        factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
        tokenA: token0,
        tokenB: token1,
        fee: poolFee,
    });
    console.log({ currentPoolAddress });
    const provider = new JsonRpcProvider(process.env['SEPOLIA_RPC'] as string);
    const poolContract = new ethers.Contract(
        currentPoolAddress,
        IUniswapV3PoolABI.abi,
        provider
      )
      
    const [liquidity, slot0] =
        await Promise.all([
          poolContract.liquidity(),
          poolContract.slot0(),
        ])

    console.log({ liquidity, slot0 });

    console.log('Tick: ', slot0.tick);
    console.log('SqrtRatio: ', slot0.sqrtPriceX96.toString());

    const configuredPool = new Pool(
        token0,
        token1,
        poolFee,
        slot0.sqrtPriceX96.toString(),
        liquidity.toString(),
        slot0.tick
    );

    console.log('Here>>>>>>>')

    const amount0: BigintIsh = "9990000000000";
    const amount1: BigintIsh = "10500090000000000000000000";

    const position = Position.fromAmounts({
        pool: configuredPool,
        tickLower:
          nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) -
          configuredPool.tickSpacing * 2,
        tickUpper:
          nearestUsableTick(configuredPool.tickCurrent, configuredPool.tickSpacing) +
          configuredPool.tickSpacing * 2,
        amount0: amount0,
        amount1: amount1,
        useFullPrecision: true,
    })

    const mintOptions: MintOptions = {
        recipient: "0x3897326cEda92B3da2c27a224D6fDCFefCaCf57A",
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        slippageTolerance: new Percent(50, 10_000),
    }
    const { calldata, value } = NonfungiblePositionManager.addCallParameters(
        position,
        mintOptions
    )

    console.log({ calldata, value });


})()